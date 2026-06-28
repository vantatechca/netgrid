"use server";

import { db } from "@/lib/db";
import { blogs, generatedPosts } from "@/lib/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  demoteH1ToH2,
  hasH1,
  normalizeMetaTitle,
  normalizeMetaDescription,
  normalizeExcerpt,
} from "@/lib/services/content-generator";
import {
  backfillPostSeo,
  fetchLivePostBody,
  resolveShopifyBlogId,
  type PlatformBlog,
} from "@/lib/services/platform-client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BackfillOptions {
  /** Cap how many posts to process this run (default 200). */
  limit?: number;
  /**
   * When true, compute the fixes and report what WOULD change, but make NO
   * external writes. Lets the operator preview the blast radius on one blog.
   */
  dryRun?: boolean;
}

export interface BackfillPostResult {
  generatedPostId: string;
  externalPostId: string | null;
  title: string | null;
  changedTitle: boolean;
  changedDescription: boolean;
  changedExcerpt: boolean;
  changedH1: boolean;
  status: "updated" | "skipped" | "failed" | "would-update";
  message?: string;
}

export interface BackfillResult {
  blogId: string;
  platform: string;
  dryRun: boolean;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  posts: BackfillPostResult[];
}

// ─── Single-blog backfill ─────────────────────────────────────────────────────

/**
 * Retroactively apply the current SEO rules to a blog's already-published
 * posts:
 *   - meta title  → pixel-capped (≤580px), keyword-first, " | " separator,
 *                   no brand suffix  (written to Shopify global.title_tag /
 *                   WP Yoast|RankMath title)
 *   - meta description → pixel-capped (≤1000px)  (Shopify description_tag /
 *                        WP Yoast|RankMath description)
 *   - body H1     → demoted to H2 so the post title stays the sole H1
 *
 * Reads each post's LIVE body from the platform (so media URLs are intact)
 * and only writes when something actually changed. Safe to re-run — every
 * step is idempotent.
 *
 * NOTE (Shopify): the "– Site Name" suffix in the rendered <title> is added
 * by the theme, not the API, and cannot be removed here. It requires a
 * one-line theme.liquid edit. This backfill sets a clean, short title_tag;
 * pair it with the theme edit to fully clear the title-length warning.
 */
export async function backfillBlogSeo(
  blogId: string,
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const { limit = 200, dryRun = false } = options;

  const [blog] = await db.select().from(blogs).where(eq(blogs.id, blogId)).limit(1);
  if (!blog) {
    throw new Error(`Blog ${blogId} not found`);
  }

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

  // Resolve the Shopify blog id ONCE for the whole run (no-op for WP).
  const shopifyCtx = await resolveShopifyBlogId(platformBlog);
  const shopifyBlogId = shopifyCtx?.blogId;

  const rows = await db
    .select({
      id: generatedPosts.id,
      title: generatedPosts.title,
      excerpt: generatedPosts.excerpt,
      metaTitle: generatedPosts.metaTitle,
      metaDescription: generatedPosts.metaDescription,
      keywords: generatedPosts.keywords,
      externalPostId: generatedPosts.externalPostId,
    })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.blogId, blogId),
        eq(generatedPosts.status, "published"),
        isNotNull(generatedPosts.externalPostId),
      ),
    )
    .orderBy(desc(generatedPosts.publishedAt))
    .limit(limit);

  const posts: BackfillPostResult[] = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const externalPostId = row.externalPostId;
    const result: BackfillPostResult = {
      generatedPostId: row.id,
      externalPostId,
      title: row.title,
      changedTitle: false,
      changedDescription: false,
      changedExcerpt: false,
      changedH1: false,
      status: "skipped",
    };

    try {
      if (!externalPostId) {
        result.status = "skipped";
        result.message = "no externalPostId";
        skipped++;
        posts.push(result);
        continue;
      }

      // Compute the compliant meta from stored values (title/excerpt fallbacks).
      const newMetaTitle = normalizeMetaTitle(row.metaTitle, row.title ?? "");
      const newMetaDescription = normalizeMetaDescription(
        row.metaDescription,
        row.excerpt ?? "",
      );
      result.changedTitle = newMetaTitle !== (row.metaTitle ?? "");
      result.changedDescription =
        newMetaDescription !== (row.metaDescription ?? "");

      // Cap the excerpt (summary_html) too — on many Shopify themes the
      // excerpt is what renders as the meta description, so an over-long
      // excerpt slips past the description pixel policy even when the
      // description_tag itself is compliant.
      const newExcerpt = normalizeExcerpt(row.excerpt ?? "");
      result.changedExcerpt = newExcerpt !== (row.excerpt ?? "");

      // Read the live body and demote any H1s.
      const liveBody = await fetchLivePostBody(
        platformBlog,
        externalPostId,
        shopifyBlogId,
      );
      let newBody: string | undefined;
      if (liveBody && hasH1(liveBody)) {
        const demoted = demoteH1ToH2(liveBody);
        if (demoted !== liveBody) {
          newBody = demoted;
          result.changedH1 = true;
        }
      }

      const focusKeyword = Array.isArray(row.keywords)
        ? (row.keywords as unknown[]).find((k): k is string => typeof k === "string")
        : undefined;

      // Nothing to do?
      if (
        !result.changedTitle &&
        !result.changedDescription &&
        !result.changedExcerpt &&
        !result.changedH1
      ) {
        result.status = "skipped";
        result.message = "already compliant";
        skipped++;
        posts.push(result);
        continue;
      }

      if (dryRun) {
        result.status = "would-update";
        updated++;
        posts.push(result);
        continue;
      }

      const push = await backfillPostSeo(
        platformBlog,
        externalPostId,
        {
          bodyHtml: newBody,
          metaTitle: result.changedTitle ? newMetaTitle : undefined,
          metaDescription: result.changedDescription
            ? newMetaDescription
            : undefined,
          excerptHtml: result.changedExcerpt ? newExcerpt : undefined,
          focusKeyword,
        },
        shopifyBlogId,
      );

      if (!push.success) {
        result.status = "failed";
        result.message = push.message;
        failed++;
        posts.push(result);
        continue;
      }

      // Persist the normalized meta back to our DB so it stays in sync.
      await db
        .update(generatedPosts)
        .set({
          metaTitle: newMetaTitle,
          metaDescription: newMetaDescription,
          ...(result.changedExcerpt && { excerpt: newExcerpt }),
          ...(newBody !== undefined && { body: newBody }),
          updatedAt: new Date(),
        })
        .where(eq(generatedPosts.id, row.id));

      result.status = "updated";
      updated++;
      posts.push(result);
    } catch (err) {
      result.status = "failed";
      result.message = err instanceof Error ? err.message : String(err);
      failed++;
      posts.push(result);
    }
  }

  return {
    blogId,
    platform: blog.platform ?? "wordpress",
    dryRun,
    total: rows.length,
    updated,
    skipped,
    failed,
    posts,
  };
}
