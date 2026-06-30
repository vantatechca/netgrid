/**
 * lib/services/post-seo-runner.ts
 *
 * Core per-post SEO scan: fetch the live page (best effort), run the focused
 * scanner, and persist the result. Kept OUT of the "use server" action file so
 * it can be called two ways:
 *
 *   - scanGeneratedPost()  (post-seo-actions.ts) — admin-gated, manual button
 *   - scanPostAfterPublishFireAndForget() — fired right after a post publishes,
 *     so every newly-published post is scanned automatically. Mirrors the
 *     index-now fire-and-forget pattern: never blocks or fails the publish.
 */

import axios from "axios";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { generatedPosts, blogs, seoScans, seoIssues } from "@/lib/db/schema";
import { logActivity } from "@/lib/services/activity-logger";
import { CRAWLER_DEFAULTS } from "@/lib/constants";
import { scanPost, type PostScanInput } from "@/lib/services/post-seo-scanner";

export interface ScanPostResult {
  success: boolean;
  message: string;
  score?: number;
  issues?: number;
  metaSource?: "live" | "stored";
  /** Set on success — used by the action wrapper to revalidate the right paths. */
  blogId?: string;
  clientId?: string;
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
 * Per-post replacement for the whole-site crawl: runs only against the one
 * post's stored content (and its live rendered <head> when reachable), writes
 * a seo_scans row for the post, and replaces any prior OPEN issues for that
 * exact page URL so re-scanning is idempotent.
 *
 * No auth check here — callers are trusted (an admin action, or the publish
 * pipeline). The admin gate lives in scanGeneratedPost().
 */
export async function runPostSeoScan(
  postId: string,
  opts: { userId?: string } = {},
): Promise<ScanPostResult> {
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

  await logActivity({
    userId: opts.userId,
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
    blogId: blog.id,
    clientId: blog.clientId,
  };
}

/**
 * Fire-and-forget per-post scan, invoked right after a publish succeeds.
 * Never blocks or rejects into the publish path — failures are logged only.
 */
export function scanPostAfterPublishFireAndForget(postId: string): void {
  runPostSeoScan(postId).catch((err) => {
    console.error(`[post-seo] auto-scan failed for post ${postId}:`, err);
  });
}
