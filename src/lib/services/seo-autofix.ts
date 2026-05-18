import { db } from "@/lib/db";
import { runPageSpeedAudit } from "@/lib/services/pagespeed-client";
import { seoIssues, blogs, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSeoFix } from "@/lib/services/claude-client";
import * as wp from "@/lib/services/wp-client";

export interface AutoFixResult {
  issueId: string;
  applied: boolean;
  message: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function markApplied(issueId: string, fixSummary: string) {
  await db
    .update(seoIssues)
    .set({
      status: "applied",
      appliedAt: new Date(),
      suggestedFix: fixSummary,
    })
    .where(eq(seoIssues.id, issueId));
}

async function markFailed(issueId: string, reason: string) {
  await db
    .update(seoIssues)
    .set({ status: "failed", failureReason: reason })
    .where(eq(seoIssues.id, issueId));
}

/**
 * Decide what kind of fix this issue calls for from its title text.
 * scoreBlog generates titles like "Missing meta description" or
 * "Meta description too short (under 120 chars)".
 */
function classifyIssue(title: string):
  | "meta_description"
  | "meta_title"
  | "og_image"
  | "og_title"
  | "og_description"
  | "alt_text"
  | "unknown" {
  const lower = title.toLowerCase();
  if (lower.includes("meta description")) return "meta_description";
  if (lower.includes("title tag")) return "meta_title";
  if (lower.includes("open graph image") || lower.includes("og:image")) return "og_image";
  if (lower.includes("open graph title") || lower.includes("og:title")) return "og_title";
  if (lower.includes("open graph description") || lower.includes("og:description"))
    return "og_description";
  if (lower.includes("alt text")) return "alt_text";
  return "unknown";
}

export async function rescanBlogScore(
  blogId: string,
): Promise<{ previousScore: number | null; newScore: number | null; delta: number | null; error?: string }> {
  const [blog] = await db.select().from(blogs).where(eq(blogs.id, blogId)).limit(1);
  if (!blog || !blog.wpUrl) {
    return { previousScore: null, newScore: null, delta: null, error: "Blog not found or missing URL" };
  }

  const previousScore = blog.currentSeoScore;
  const psi = await runPageSpeedAudit(blog.wpUrl, "mobile");
  const newScore = psi.scores.seo;

  if (newScore === null) {
    return {
      previousScore,
      newScore: null,
      delta: null,
      error: psi.error || "PageSpeed Insights returned no SEO score",
    };
  }

  await db
    .update(blogs)
    .set({
      currentSeoScore: newScore,
      lastSeoScanAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(blogs.id, blogId));

  return {
    previousScore,
    newScore,
    delta: previousScore !== null ? newScore - previousScore : null,
  };
}

/**
 * Apply a single auto-fixable SEO issue end-to-end:
 *   1. Look up the WordPress post by URL (via slug)
 *   2. Generate the new value via Claude (using post title + excerpt as context)
 *   3. PATCH the post via REST — uses Yoast / RankMath / native excerpt depending
 *      on which SEO plugin the blog has configured
 *   4. Mark the issue applied (or failed with a reason)
 */
export async function autoFixIssue(issueId: string): Promise<AutoFixResult> {
  const [issue] = await db
    .select()
    .from(seoIssues)
    .where(eq(seoIssues.id, issueId))
    .limit(1);
  if (!issue) return { issueId, applied: false, message: "Issue not found" };
  if (!issue.autoFixable) return { issueId, applied: false, message: "Not auto-fixable" };
  if (issue.status === "applied" || issue.status === "verified") {
    return { issueId, applied: true, message: "Already applied" };
  }

  const [blog] = await db.select().from(blogs).where(eq(blogs.id, issue.blogId)).limit(1);
  if (!blog) {
    await markFailed(issueId, "Blog not found");
    return { issueId, applied: false, message: "Blog not found" };
  }
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    await markFailed(issueId, "Blog WP credentials missing");
    return { issueId, applied: false, message: "Blog credentials missing" };
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, issue.clientId))
    .limit(1);
  const niche = client?.niche || "general";

  const post = await wp.findPostByUrl(
    blog.wpUrl,
    blog.wpUsername,
    blog.wpAppPassword,
    issue.pageUrl || "",
  );
  if (!post) {
    await markFailed(issueId, `Could not find a WordPress post matching ${issue.pageUrl}`);
    return { issueId, applied: false, message: "Post not found" };
  }

  const kind = classifyIssue(issue.title);
  const pageTitle = post.title?.rendered || "";
  const pageExcerpt = stripHtml(post.excerpt?.rendered || post.content?.rendered || "").slice(
    0,
    600,
  );

  try {
    if (kind === "meta_description") {
      const newValue = await generateSeoFix({
        niche,
        blogDomain: blog.domain,
        pageUrl: issue.pageUrl || "",
        pageTitle,
        pageContentExcerpt: pageExcerpt,
        issueType: "meta_description",
        issueDescription: issue.description || issue.title,
      });
      const trimmed = newValue.replace(/\s+/g, " ").trim().slice(0, 160);
      await applyMetaDescription(blog, post.id, trimmed);
      await markApplied(issueId, `meta description: ${trimmed}`);
      return { issueId, applied: true, message: `Meta description set on post ${post.id}` };
    }

    if (kind === "meta_title") {
      const newValue = await generateSeoFix({
        niche,
        blogDomain: blog.domain,
        pageUrl: issue.pageUrl || "",
        pageTitle,
        pageContentExcerpt: pageExcerpt,
        issueType: "meta_title",
        issueDescription: issue.description || issue.title,
      });
      const trimmed = newValue.replace(/\s+/g, " ").trim().slice(0, 60);
      await applyMetaTitle(blog, post.id, trimmed);
      await markApplied(issueId, `meta title: ${trimmed}`);
      return { issueId, applied: true, message: `Meta title set on post ${post.id}` };
    }

    if (kind === "og_title" || kind === "og_description") {
      // Yoast/RankMath default OG fields to meta_title/meta_description when
      // OG-specific aren't set — so we set the regular meta and they cascade.
      const issueType = kind === "og_title" ? "meta_title" : "meta_description";
      const newValue = await generateSeoFix({
        niche,
        blogDomain: blog.domain,
        pageUrl: issue.pageUrl || "",
        pageTitle,
        pageContentExcerpt: pageExcerpt,
        issueType,
        issueDescription: issue.description || issue.title,
      });
      const trimmed = newValue
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, kind === "og_title" ? 60 : 160);
      if (kind === "og_title") {
        await applyMetaTitle(blog, post.id, trimmed);
      } else {
        await applyMetaDescription(blog, post.id, trimmed);
      }
      await markApplied(issueId, `${kind}: ${trimmed}`);
      return { issueId, applied: true, message: `${kind} set on post ${post.id}` };
    }

    // Image alt text and OG image require richer issue context (which image,
    // upload a new file). Skip for now — they stay in 'detected' for human
    // review on /seo/fix-queue.
    return {
      issueId,
      applied: false,
      message: `Auto-fix not implemented for: ${issue.title}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await markFailed(issueId, message);
    return { issueId, applied: false, message };
  }
}

// ─── Per-plugin appliers ────────────────────────────────────────────────────

async function applyMetaDescription(
  blog: typeof blogs.$inferSelect,
  postId: number,
  value: string,
) {
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    throw new Error("WP credentials missing");
  }
  if (blog.seoPlugin === "yoast") {
    await wp.updateYoastMeta(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, postId, {
      yoast_wpseo_metadesc: value,
    });
  } else if (blog.seoPlugin === "rankmath") {
    await wp.updateRankMathMeta(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, postId, {
      rank_math_description: value,
    });
  } else {
    // No SEO plugin — fall back to the native post excerpt, which most themes
    // surface as the meta description by default.
    await wp.updatePost(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, postId, {
      excerpt: value,
    });
  }
}

async function applyMetaTitle(
  blog: typeof blogs.$inferSelect,
  postId: number,
  value: string,
) {
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    throw new Error("WP credentials missing");
  }
  if (blog.seoPlugin === "yoast") {
    await wp.updateYoastMeta(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, postId, {
      yoast_wpseo_title: value,
    });
  } else if (blog.seoPlugin === "rankmath") {
    await wp.updateRankMathMeta(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, postId, {
      rank_math_title: value,
    });
  } else {
    await wp.updatePost(blog.wpUrl, blog.wpUsername, blog.wpAppPassword, postId, {
      title: value,
    });
  }
}

/**
 * Fan-out helper used by the Apply All button (and by the SEO scan cron if you
 * decide to re-enable inline auto-fix). Caps the number of fixes applied per
 * call so a noisy queue can't consume the cron's full duration budget. Failed
 * fixes don't stop the loop.
 */
export async function autoFixIssuesForScan(
  scanIssueIds: string[],
  maxToApply: number = 10,
): Promise<{ applied: number; failed: number; results: AutoFixResult[] }> {
  const results: AutoFixResult[] = [];
  let applied = 0;
  let failed = 0;
  for (const issueId of scanIssueIds.slice(0, maxToApply)) {
    const result = await autoFixIssue(issueId);
    results.push(result);
    if (result.applied) applied++;
    else failed++;
  }
  return { applied, failed, results };
}