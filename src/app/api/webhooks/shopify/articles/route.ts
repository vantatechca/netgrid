import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { blogs, generatedPosts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { embedPost, applyRelatedLinks } from "@/lib/services/semantic-linking";

// Shopify posts the full article body; allow time for re-embed + relink.
export const maxDuration = 120;
// Webhook bodies are raw JSON we HMAC-verify ourselves — never cache.
export const dynamic = "force-dynamic";

/**
 * Shopify `articles/create` and `articles/update` webhook receiver.
 *
 * When a Shopify article netgrid tracks is created or edited (including edits
 * made directly in Shopify admin, which the internal publish hook can't see),
 * re-embed it from the new content and refresh its related-posts links.
 *
 * Security: verifies the HMAC-SHA256 signature in `X-Shopify-Hmac-Sha256`
 * against SHOPIFY_WEBHOOK_SECRET over the raw request body. Requests that
 * fail verification are rejected with 401. If the secret isn't configured the
 * endpoint is disabled (503) rather than accepting unverified input.
 *
 * Registration (one-time, per store) is out of scope for this handler — point
 * the store's `articles/create` + `articles/update` webhooks at this URL and
 * set SHOPIFY_WEBHOOK_SECRET to the app's signing secret.
 */
export async function POST(request: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Shopify webhooks are not configured" },
      { status: 503 },
    );
  }

  const raw = await request.text();
  const provided = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const digest = crypto
    .createHmac("sha256", secret)
    .update(raw, "utf8")
    .digest("base64");

  // Constant-time compare; timingSafeEqual throws on length mismatch, so guard.
  const providedBuf = Buffer.from(provided, "base64");
  const digestBuf = Buffer.from(digest, "base64");
  const valid =
    providedBuf.length === digestBuf.length &&
    crypto.timingSafeEqual(providedBuf, digestBuf);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { id?: number | string; title?: string; body_html?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const articleId = payload.id != null ? String(payload.id) : "";
  if (!articleId) {
    // Nothing to correlate — ack so Shopify doesn't retry.
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const shopDomain = (
    request.headers.get("x-shopify-shop-domain") ?? ""
  ).toLowerCase();

  // Find the tracked post(s) for this Shopify article. Match on external id +
  // shopify platform; disambiguate by shop domain when we have it.
  const matches = await db
    .select({
      id: generatedPosts.id,
      storeUrl: blogs.shopifyStoreUrl,
    })
    .from(generatedPosts)
    .innerJoin(blogs, eq(generatedPosts.blogId, blogs.id))
    .where(
      and(
        eq(generatedPosts.externalPostId, articleId),
        eq(blogs.platform, "shopify"),
      ),
    );

  const scoped = shopDomain
    ? matches.filter((m) =>
        (m.storeUrl ?? "").toLowerCase().includes(shopDomain),
      )
    : matches;
  const targets = scoped.length > 0 ? scoped : matches;

  let processed = 0;
  for (const target of targets) {
    try {
      // Re-embed from the edited live content, then refresh links.
      const embedded = await embedPost(target.id, {
        title: payload.title,
        body: payload.body_html,
      });
      if (embedded.ok) {
        await applyRelatedLinks(target.id);
        processed++;
      }
    } catch {
      // Best-effort — ack the webhook regardless so Shopify doesn't retry-storm.
    }
  }

  return NextResponse.json({ ok: true, matched: targets.length, processed });
}
