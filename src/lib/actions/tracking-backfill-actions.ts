"use server";

import { db } from "@/lib/db";
import { blogs, clients, generatedPosts } from "@/lib/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  backfillPostSeo,
  fetchLivePostBody,
  resolveShopifyBlogId,
  type PlatformBlog,
} from "@/lib/services/platform-client";
import {
  ctaRedirectUrl,
  trackingPixelUrl,
  trackingPixelImg,
} from "@/lib/services/link-tracker";

export interface TrackingBackfillResult {
  blogId: string;
  platform: string;
  /** Published posts considered this run (capped by `limit`). */
  total: number;
  /** Posts whose live body was rewritten (CTA and/or pixel added). */
  updated: number;
  /** Already tracked — nothing to change. */
  skipped: number;
  failed: number;
  /** Posts beyond this run's cap; re-run to process them. */
  remaining: number;
}

/** Repoint an <a> whose href exactly matches the CTA URL to the tracked redirect. */
function rewriteCtaHref(html: string, ctaUrl: string, redirectUrl: string): string {
  const esc = ctaUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`href=(["'])${esc}\\1`, "g"), `href=$1${redirectUrl}$1`);
}

/**
 * Retroactively add netgrid tracking to a blog's already-published posts:
 *   - repoint the CTA button (href = the client's CTA URL) to /r/{postId}
 *   - append the page-view pixel (/api/track/px/{postId}) if missing
 *
 * Reads each post's LIVE body from the platform and only writes when something
 * changed, so it's safe to re-run. Newer posts already carry both and are
 * skipped. Processes up to `limit` posts (newest first) per run; when a blog
 * has more, `remaining` says how many are left — just run it again.
 */
export async function backfillBlogTracking(
  blogId: string,
  options: { limit?: number } = {},
): Promise<TrackingBackfillResult> {
  await requireAdmin();
  const limit = Math.min(200, Math.max(1, options.limit ?? 60));

  const [blog] = await db.select().from(blogs).where(eq(blogs.id, blogId)).limit(1);
  if (!blog) throw new Error(`Blog ${blogId} not found`);

  const platformBlog: PlatformBlog = {
    platform: blog.platform,
    wpUrl: blog.wpUrl,
    wpUsername: blog.wpUsername,
    wpAppPassword: blog.wpAppPassword,
    seoPlugin: blog.seoPlugin,
    shopifyAuthMode: blog.shopifyAuthMode,
    shopifyStoreUrl: blog.shopifyStoreUrl,
    shopifyAdminApiToken: blog.shopifyAdminApiToken,
    shopifyClientId: blog.shopifyClientId,
    shopifyClientSecret: blog.shopifyClientSecret,
    shopifyBlogHandle: blog.shopifyBlogHandle,
  };

  const [client] = await db
    .select({ ctaEnabled: clients.ctaEnabled, ctaUrl: clients.ctaUrl })
    .from(clients)
    .where(eq(clients.id, blog.clientId))
    .limit(1);
  const ctaUrl = client?.ctaEnabled && client.ctaUrl ? client.ctaUrl : null;

  // Resolve the Shopify blog id ONCE for the whole run (no-op for WP).
  const shopifyCtx = await resolveShopifyBlogId(platformBlog);
  const shopifyBlogId = shopifyCtx?.blogId;

  // Fetch one more than the cap so we can tell whether any remain.
  const rows = await db
    .select({ id: generatedPosts.id, externalPostId: generatedPosts.externalPostId })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.blogId, blogId),
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.externalPostId),
      ),
    )
    .orderBy(desc(generatedPosts.publishedAt))
    .limit(limit + 1);

  const remaining = Math.max(0, rows.length - limit);
  const batch = rows.slice(0, limit);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of batch) {
    const externalPostId = row.externalPostId;
    if (!externalPostId) {
      skipped++;
      continue;
    }
    try {
      const body = await fetchLivePostBody(platformBlog, externalPostId, shopifyBlogId);
      if (body === null) {
        failed++;
        continue;
      }

      let next = body;
      if (ctaUrl) next = rewriteCtaHref(next, ctaUrl, ctaRedirectUrl(row.id));
      if (!next.includes(trackingPixelUrl(row.id))) next += trackingPixelImg(row.id);

      if (next === body) {
        skipped++;
        continue;
      }

      const push = await backfillPostSeo(
        platformBlog,
        externalPostId,
        { bodyHtml: next },
        shopifyBlogId,
      );
      if (!push.success) {
        failed++;
        continue;
      }

      await db
        .update(generatedPosts)
        .set({ body: next, updatedAt: new Date() })
        .where(eq(generatedPosts.id, row.id));
      updated++;
    } catch {
      failed++;
    }
  }

  return {
    blogId,
    platform: blog.platform ?? "wordpress",
    total: batch.length,
    updated,
    skipped,
    failed,
    remaining,
  };
}
