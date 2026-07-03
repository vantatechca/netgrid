"use server";

import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  getReadingSettings,
  getPageRawContent,
  updatePageContent,
} from "@/lib/services/wp-client";
import { blogTrackingPixelImg } from "@/lib/services/link-tracker";

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

  const hadBlock = BLOCK_RE.test(raw);
  const stripped = raw.replace(BLOCK_RE, "").replace(/\s+$/, "");
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

  return {
    success: true,
    message: `Tracking pixel ${hadBlock ? "updated" : "installed"} on the homepage (page #${pageId}). New posts already carry their own pixel.`,
    action: hadBlock ? "updated" : "installed",
  };
}
