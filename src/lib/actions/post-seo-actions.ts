"use server";

import axios from "axios";
import { revalidatePath } from "next/cache";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { generatedPosts, blogs, seoScans, seoIssues } from "@/lib/db/schema";
import { requireAdmin, getSession } from "@/lib/auth/helpers";
import { logActivity } from "@/lib/services/activity-logger";
import { CRAWLER_DEFAULTS } from "@/lib/constants";
import { scanPost, type PostScanInput } from "@/lib/services/post-seo-scanner";

export interface ScanPostResult {
  success: boolean;
  message: string;
  score?: number;
  issues?: number;
  metaSource?: "live" | "stored";
}

/**
 * Best-effort fetch of the live published page. Many destination stores are
 * password-walled dev shops that return 401/403 (or the request is blocked
 * outright) — in that case we return null and the scanner falls back to the
 * stored content, which is still a useful per-post audit.
 */
async function fetchLiveHtml(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: CRAWLER_DEFAULTS.requestTimeoutMs,
      headers: { "User-Agent": CRAWLER_DEFAULTS.userAgent },
      maxRedirects: 3,
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300 && typeof res.data === "string") {
      return res.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Scan a single GENERATED post for SEO issues and persist the result.
 *
 * This is the per-post replacement for the whole-site crawl: it runs only
 * against the one post's stored content (and its live rendered <head> when
 * reachable), writes a seo_scans row for the post, and replaces any prior
 * OPEN issues for that exact page URL so re-scanning is idempotent.
 */
export async function scanGeneratedPost(postId: string): Promise<ScanPostResult> {
  await requireAdmin();

  const [post] = await db
    .select()
    .from(generatedPosts)
    .where(eq(generatedPosts.id, postId))
    .limit(1);
  if (!post) return { success: false, message: "Post not found" };
  if (post.status !== "published") {
    return {
      success: false,
      message: "SEO is only scanned once a post is published.",
    };
  }

  const [blog] = await db
    .select()
    .from(blogs)
    .where(eq(blogs.id, post.blogId))
    .limit(1);
  if (!blog) return { success: false, message: "Blog not found" };

  // Resolve the public URL for this post. Prefer the stored external URL;
  // if absent there's nothing to scope the scan to.
  const pageUrl = post.externalPostUrl?.trim() || null;
  if (!pageUrl) {
    return {
      success: false,
      message: "This post has no published URL to scan yet.",
    };
  }

  const liveHtml = await fetchLiveHtml(pageUrl);

  const input: PostScanInput = {
    platform: blog.platform,
    pageUrl,
    articleId: post.externalPostId,
    articleTitle: post.title,
    body: post.body,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    liveHtml,
  };

  const result = scanPost(input);

  // Persist a per-post scan row.
  const [scan] = await db
    .insert(seoScans)
    .values({
      blogId: blog.id,
      clientId: blog.clientId,
      overallScore: result.overallScore,
      metaScore: result.metaScore,
      contentScore: result.contentScore,
      technicalScore: result.technicalScore,
      linkScore: result.linkScore,
      imageScore: result.imageScore,
      pagesCrawled: 1,
      issuesFound: result.issuesFound,
      criticalIssues: result.criticalIssues,
      warnings: result.warnings,
      notices: result.notices,
      rawData: {
        kind: "post_scan",
        postId: post.id,
        pageUrl,
        metaSource: result.metaSource,
      },
      scanDurationMs: result.scanDurationMs,
    })
    .returning();

  // Idempotent re-scan: clear prior OPEN issues for this exact post URL so the
  // queue reflects the latest state instead of stacking duplicates. Applied /
  // failed / dismissed history is preserved.
  await db
    .delete(seoIssues)
    .where(
      and(
        eq(seoIssues.blogId, blog.id),
        eq(seoIssues.pageUrl, pageUrl),
        inArray(seoIssues.status, ["detected", "queued"]),
      ),
    );

  if (result.issues.length > 0) {
    await db.insert(seoIssues).values(
      result.issues.map((issue) => ({
        scanId: scan.id,
        blogId: blog.id,
        clientId: blog.clientId,
        pageUrl: issue.pageUrl,
        category: issue.category,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        fixPayload: issue.fixPayload ?? null,
        autoFixable: issue.autoFixable,
        status: "detected" as const,
      })),
    );
  }

  // Cache the post's own SEO score for the posts table.
  await db
    .update(generatedPosts)
    .set({ seoScore: result.overallScore, updatedAt: new Date() })
    .where(eq(generatedPosts.id, post.id));

  const session = await getSession();
  await logActivity({
    userId: session?.user?.id,
    clientId: blog.clientId,
    action: "seo_post_scanned",
    entityType: "generated_post",
    entityId: post.id,
    details: {
      score: result.overallScore,
      issues: result.issuesFound,
      metaSource: result.metaSource,
    },
  });

  revalidatePath(`/blogs/${blog.id}/posts`);
  revalidatePath(`/seo/clients/${blog.clientId}`);

  return {
    success: true,
    message:
      result.issuesFound === 0
        ? `Scan complete — no issues found (score ${result.overallScore}).`
        : `Scan complete — ${result.issuesFound} issue${
            result.issuesFound > 1 ? "s" : ""
          } found (score ${result.overallScore}).`,
    score: result.overallScore,
    issues: result.issuesFound,
    metaSource: result.metaSource,
  };
}
