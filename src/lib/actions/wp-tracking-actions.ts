"use server";

import { db } from "@/lib/db";
import { blogs, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  getReadingSettings,
  getPageRawContent,
  updatePageContent,
} from "@/lib/services/wp-client";
import {
  blogTrackingPixelImg,
  blogCtaRedirectUrl,
} from "@/lib/services/link-tracker";

export interface WpHomepageTrackerResult {
  success: boolean;
  message: string;
  action?: "installed" | "updated" | "unchanged";
}

const MARK_BEGIN = "<!-- netgrid:homepage-tracker -->";
const MARK_END = "<!-- /netgrid:homepage-tracker -->";
const BLOCK_RE =
  /<!-- netgrid:homepage-tracker -->[\s\S]*?<!-- \/netgrid:homepage-tracker -->/g;

/**
 * Repoint homepage links whose href is the client's CTA URL to the tracked
 * blog-level redirect, so CTA clicks on the homepage are logged. Only touches
 * `href="..."` / `href='...'` attributes that exactly match, and is idempotent
 * (once rewritten, the raw CTA URL no longer matches).
 */
function rewriteCtaHrefs(
  html: string,
  ctaUrl: string,
  redirectUrl: string,
): { html: string; count: number } {
  const esc = ctaUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`href=(["'])${esc}\\1`, "g");
  let count = 0;
  const out = html.replace(re, (_m, q) => {
    count++;
    return `href=${q}${redirectUrl}${q}`;
  });
  return { html: out, count };
}

/**
 * Install (or refresh) a site-wide page-view pixel on a WordPress blog's
 * homepage. Only works when the site uses a static Page as its homepage
 * (Settings → Reading → "A static page"): we embed the blog-level tracking
 * pixel into that page's content. When the homepage is the blog post index
 * there is no single page to edit via the REST API, so we report that instead.
 *
 * Idempotent — the managed block is delimited by HTML-comment markers and
 * replaced in place on re-run.
 */
export async function installWpHomepageTracker(
  blogId: string,
): Promise<WpHomepageTrackerResult> {
  await requireAdmin();

  const [blog] = await db
    .select()
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!blog) return { success: false, message: "Blog not found." };
  if (blog.platform !== "wordpress") {
    return {
      success: false,
      message: "Homepage tracking here is for WordPress blogs.",
    };
  }
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return {
      success: false,
      message: "This blog is missing WordPress URL / credentials.",
    };
  }

  const creds = [blog.wpUrl, blog.wpUsername, blog.wpAppPassword] as const;

  const settings = await getReadingSettings(...creds);
  if (!settings) {
    return {
      success: false,
      message:
        "Could not read the site's reading settings (needs an admin application password).",
    };
  }
  if (settings.showOnFront !== "page" || !settings.pageOnFront) {
    return {
      success: false,
      message:
        "The homepage is the blog post index, not a static page — there's no single page to inject a pixel into via the REST API. Set a static homepage under Settings → Reading, then re-run; or add the pixel with a header-snippet plugin.",
    };
  }

  const pageId = settings.pageOnFront;
  const raw = await getPageRawContent(...creds, pageId);
  if (raw === null) {
    return {
      success: false,
      message: `Could not read the homepage (page #${pageId}).`,
    };
  }

  // The client's active CTA URL, so we can also track homepage CTA clicks.
  const [client] = await db
    .select({ ctaEnabled: clients.ctaEnabled, ctaUrl: clients.ctaUrl })
    .from(clients)
    .where(eq(clients.id, blog.clientId))
    .limit(1);
  const ctaUrl = client?.ctaEnabled && client.ctaUrl ? client.ctaUrl : null;

  const hadBlock = BLOCK_RE.test(raw);
  let stripped = raw.replace(BLOCK_RE, "").replace(/\s+$/, "");

  let ctaRewrites = 0;
  if (ctaUrl) {
    const rewritten = rewriteCtaHrefs(
      stripped,
      ctaUrl,
      blogCtaRedirectUrl(blogId),
    );
    stripped = rewritten.html;
    ctaRewrites = rewritten.count;
  }

  const block = `${MARK_BEGIN}\n${blogTrackingPixelImg(blogId)}\n${MARK_END}`;
  const next = stripped ? `${stripped}\n\n${block}\n` : `${block}\n`;

  if (next.trim() === raw.trim()) {
    return {
      success: true,
      message: "Homepage already has the current tracking pixel — no change.",
      action: "unchanged",
    };
  }

  const ok = await updatePageContent(...creds, pageId, next);
  if (!ok) {
    return {
      success: false,
      message: `Failed to update the homepage (page #${pageId}). Check that the user can edit pages.`,
    };
  }

  const ctaNote =
    ctaRewrites > 0
      ? ` ${ctaRewrites} CTA link${ctaRewrites === 1 ? "" : "s"} now tracked.`
      : ctaUrl
        ? " No CTA links matching the client's CTA URL were found in the homepage content."
        : "";

  return {
    success: true,
    message: `Tracking pixel ${hadBlock ? "updated" : "installed"} on the homepage (page #${pageId}).${ctaNote} New posts already carry their own pixel.`,
    action: hadBlock ? "updated" : "installed",
  };
}
