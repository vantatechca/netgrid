import { db } from "@/lib/db";
import { runPageSpeedAudit } from "@/lib/services/pagespeed-client";
import { seoIssues, blogs, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSeoFix } from "@/lib/services/claude-client";
import * as wp from "@/lib/services/wp-client";
import { injectArticleSchema } from "@/lib/services/wp-seo-injector";
import {
  backfillPostSeo,
  resolveShopifyBlogId,
  type PlatformBlog,
} from "@/lib/services/platform-client";
import { scanBlog, type BlogDescriptor } from "@/lib/seo/scanner";
import {
  truncateToPx,
  TITLE_FONT_PX,
  DESC_FONT_PX,
  TITLE_TARGET_PX,
  DESC_TARGET_PX,
} from "@/lib/seo/text-width";

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

/** First <img src> in an HTML string, if any. */
function firstImageSrc(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/**
 * Plugin-independent SEO for WordPress blogs with NO SEO plugin: inject an
 * idempotent JSON-LD Article block carrying the meta description into the post
 * body (Google reads JSON-LD anywhere). No-op for Yoast/RankMath sites, which
 * already emit schema. Returns a short note to append to the fix message, or
 * "" when nothing was done.
 */
async function injectSchemaForPluginlessWp(
  blog: typeof blogs.$inferSelect,
  post: wp.WpPost,
  description: string,
): Promise<string> {
  if (blog.seoPlugin !== "none") return "";
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) return "";

  const res = await injectArticleSchema(
    {
      wpUrl: blog.wpUrl,
      username: blog.wpUsername,
      appPassword: blog.wpAppPassword,
    },
    post.id,
    {
      url: post.link,
      headline: stripHtml(post.title?.rendered || ""),
      description,
      datePublished: post.date_gmt ? `${post.date_gmt}Z` : null,
      dateModified: post.modified_gmt ? `${post.modified_gmt}Z` : null,
      publisherName: blog.domain,
      imageUrl: firstImageSrc(post.content?.rendered || ""),
    },
  );

  if (!res.ok) return ` · schema not injected: ${res.message}`;
  return res.persisted
    ? " · Article schema injected"
    : ` · ${res.message}`;
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
 * Resolve the value to write for a meta title/description fix. Prefers the
 * existing on-page text (a "too long" field just needs trimming — no LLM call,
 * so it also works when the model's credit is out); only generates when there's
 * no usable source text. Returns whitespace-collapsed text (still needs the
 * caller's pixel truncation).
 */
async function resolveMetaValue(opts: {
  source: string | null | undefined;
  generate: () => Promise<string>;
}): Promise<string> {
  const s = (opts.source ?? "").replace(/\s+/g, " ").trim();
  if (s) return s;
  return (await opts.generate()).replace(/\s+/g, " ").trim();
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

/**
 * Resolve the fix kind from the stored fixPayload.type first (set by the
 * scanner), falling back to the title-text classifier. The Shopify scanner's
 * issue titles differ from WordPress's ("Missing article excerpt" vs "Missing
 * meta description"), so payload-type routing is what makes the queue
 * platform-agnostic.
 */
function classifyFix(
  issue: typeof seoIssues.$inferSelect,
): ReturnType<typeof classifyIssue> {
  const type = (issue.fixPayload as { type?: string } | null)?.type;
  if (type === "shopify_meta_description" || type === "wp_meta_description") {
    return "meta_description";
  }
  if (type === "shopify_meta_title" || type === "wp_meta_title") {
    return "meta_title";
  }
  return classifyIssue(issue.title);
}

/** Build the platform-router blog shape from a DB row. */
function blogToPlatformBlog(blog: typeof blogs.$inferSelect): PlatformBlog {
  return {
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
}

/**
 * Apply a Shopify SEO fix. Writes the global.title_tag / description_tag
 * metafields (the values the theme renders) via the platform router —
 * the same write path the bulk backfill uses, now reachable from the
 * per-issue fix queue. The article id comes from the scanner's fixPayload.
 */
async function autoFixShopifyIssue(
  issue: typeof seoIssues.$inferSelect,
  blog: typeof blogs.$inferSelect,
  niche: string,
): Promise<AutoFixResult> {
  const issueId = issue.id;
  const payload = (issue.fixPayload ?? {}) as {
    type?: string;
    articleId?: number | string;
    articleTitle?: string;
    excerpt?: string;
    pageUrl?: string;
  };
  const articleId = payload.articleId != null ? String(payload.articleId) : null;
  if (!articleId) {
    // These come from the sitemap crawler (products, collections, sitemap
    // files, anchors) which blanket-flags "missing meta description" as
    // auto-fixable. netgrid can only write a blog ARTICLE's metafields, so a
    // non-article page has no fix target. Demote it to manual (instead of a
    // cryptic error) so the Apply button stops offering an impossible fix.
    await db
      .update(seoIssues)
      .set({ autoFixable: false })
      .where(eq(seoIssues.id, issueId));
    return {
      issueId,
      applied: false,
      message:
        "This page isn't a blog article — product / collection / sitemap meta can't be auto-fixed here. Marked as manual.",
    };
  }

  const platformBlog = blogToPlatformBlog(blog);
  const kind = classifyFix(issue);
  const pageUrl = issue.pageUrl || payload.pageUrl || "";

  try {
    if (kind !== "meta_description" && kind !== "meta_title") {
      return {
        issueId,
        applied: false,
        message: `Auto-fix not implemented for Shopify: ${issue.title}`,
      };
    }

    const issueType = kind === "meta_title" ? "meta_title" : "meta_description";
    // Prefer a mechanical fix: a "too long" title/description just needs the
    // existing text trimmed to the pixel budget — no LLM call (which also fails
    // when the model's credit is out). Fall back to generating only when we
    // have no source text (e.g. a genuinely missing field with no body).
    const source =
      kind === "meta_title"
        ? (payload.articleTitle || "").trim()
        : (payload.excerpt || "").trim();
    let cleaned: string;
    if (source) {
      cleaned = source.replace(/\s+/g, " ").trim();
    } else {
      const generated = await generateSeoFix({
        niche,
        blogDomain: blog.domain,
        pageUrl,
        pageTitle: payload.articleTitle || "",
        pageContentExcerpt: payload.excerpt || "",
        issueType,
        issueDescription: issue.description || issue.title,
      });
      cleaned = generated.replace(/\s+/g, " ").trim();
    }
    const trimmed =
      kind === "meta_title"
        ? truncateToPx(cleaned, TITLE_FONT_PX, TITLE_TARGET_PX)
        : truncateToPx(cleaned, DESC_FONT_PX, DESC_TARGET_PX);

    // Resolve the numeric blog id once so updateArticle hits the right blog.
    const shopifyBlogId = (await resolveShopifyBlogId(platformBlog))?.blogId;
    const push = await backfillPostSeo(
      platformBlog,
      articleId,
      kind === "meta_title"
        ? { metaTitle: trimmed }
        : // Write both the description_tag metafield (what renders) AND the
          // excerpt (summary_html) — the scanner flags a missing excerpt, so
          // setting it is what makes the fix clear on the next re-scan.
          { metaDescription: trimmed, excerptHtml: trimmed },
      shopifyBlogId,
    );
    if (!push.success) {
      await markFailed(issueId, push.message);
      return { issueId, applied: false, message: push.message };
    }
    await markApplied(issueId, `${issueType}: ${trimmed}`);
    return {
      issueId,
      applied: true,
      message: `${issueType} set on Shopify article ${articleId}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await markFailed(issueId, message);
    return { issueId, applied: false, message };
  }
}

export async function rescanBlogScore(
  blogId: string,
): Promise<{ previousScore: number | null; newScore: number | null; delta: number | null; error?: string }> {
  const [blog] = await db.select().from(blogs).where(eq(blogs.id, blogId)).limit(1);
  if (!blog) {
    return { previousScore: null, newScore: null, delta: null, error: "Blog not found" };
  }

  const previousScore = blog.currentSeoScore;

  // Shopify blogs have no WordPress URL for PageSpeed — recompute the score
  // from the content scanner instead (same path the SEO scan uses).
  if (blog.platform === "shopify") {
    const descriptor: BlogDescriptor = {
      id: blog.id,
      platform: blog.platform,
      domain: blog.domain,
      shopifyStoreUrl: blog.shopifyStoreUrl,
      shopifyAdminApiToken: blog.shopifyAdminApiToken,
      shopifyAuthMode: blog.shopifyAuthMode,
      shopifyClientId: blog.shopifyClientId,
      shopifyClientSecret: blog.shopifyClientSecret,
      shopifyBlogHandle: blog.shopifyBlogHandle,
    };
    const result = await scanBlog(descriptor);
    const newScore = result.overallScore;
    await db
      .update(blogs)
      .set({ currentSeoScore: newScore, lastSeoScanAt: new Date(), updatedAt: new Date() })
      .where(eq(blogs.id, blogId));
    return {
      previousScore,
      newScore,
      delta: previousScore !== null ? newScore - previousScore : null,
    };
  }

  if (!blog.wpUrl) {
    return { previousScore, newScore: null, delta: null, error: "Blog missing WP URL" };
  }
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

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, issue.clientId))
    .limit(1);
  const niche = client?.niche || "general";

  // Shopify fixes run through the platform router (writes the SEO metafields),
  // not the WordPress REST path below.
  if (blog.platform === "shopify") {
    return autoFixShopifyIssue(issue, blog, niche);
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    await markFailed(issueId, "Blog WP credentials missing");
    return { issueId, applied: false, message: "Blog credentials missing" };
  }

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

  const kind = classifyFix(issue);
  const pageTitle = post.title?.rendered || "";
  const pageExcerpt = stripHtml(post.excerpt?.rendered || post.content?.rendered || "").slice(
    0,
    600,
  );

  try {
    if (kind === "meta_description") {
      const cleaned = await resolveMetaValue({
        source: pageExcerpt,
        generate: () =>
          generateSeoFix({
            niche,
            blogDomain: blog.domain,
            pageUrl: issue.pageUrl || "",
            pageTitle,
            pageContentExcerpt: pageExcerpt,
            issueType: "meta_description",
            issueDescription: issue.description || issue.title,
          }),
      });
      const trimmed = truncateToPx(cleaned, DESC_FONT_PX, DESC_TARGET_PX);
      await applyMetaDescription(blog, post.id, trimmed);
      // Plugin-less sites can't render a <meta name="description"> — also drop
      // the description into JSON-LD Article schema in the body so it counts.
      const schemaNote = await injectSchemaForPluginlessWp(blog, post, trimmed);
      await markApplied(issueId, `meta description: ${trimmed}`);
      return {
        issueId,
        applied: true,
        message: `Meta description set on post ${post.id}${schemaNote}`,
      };
    }

    if (kind === "meta_title") {
      const cleaned = await resolveMetaValue({
        source: pageTitle,
        generate: () =>
          generateSeoFix({
            niche,
            blogDomain: blog.domain,
            pageUrl: issue.pageUrl || "",
            pageTitle,
            pageContentExcerpt: pageExcerpt,
            issueType: "meta_title",
            issueDescription: issue.description || issue.title,
          }),
      });
      const trimmed = truncateToPx(cleaned, TITLE_FONT_PX, TITLE_TARGET_PX);
      await applyMetaTitle(blog, post.id, trimmed);
      await markApplied(issueId, `meta title: ${trimmed}`);
      return { issueId, applied: true, message: `Meta title set on post ${post.id}` };
    }

    if (kind === "og_title" || kind === "og_description") {
      // Yoast/RankMath default OG fields to meta_title/meta_description when
      // OG-specific aren't set — so we set the regular meta and they cascade.
      const issueType = kind === "og_title" ? "meta_title" : "meta_description";
      const cleaned = await resolveMetaValue({
        source: kind === "og_title" ? pageTitle : pageExcerpt,
        generate: () =>
          generateSeoFix({
            niche,
            blogDomain: blog.domain,
            pageUrl: issue.pageUrl || "",
            pageTitle,
            pageContentExcerpt: pageExcerpt,
            issueType,
            issueDescription: issue.description || issue.title,
          }),
      });
      const trimmed =
        kind === "og_title"
          ? truncateToPx(cleaned, TITLE_FONT_PX, TITLE_TARGET_PX)
          : truncateToPx(cleaned, DESC_FONT_PX, DESC_TARGET_PX);
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