/**
 * lib/seo/scanner.ts
 * Fetches pages from a blog (WordPress or Shopify) and runs SEO checks.
 * Returns a structured ScanResult ready to be persisted.
 */

import {
  measureTitlePx,
  measureDescriptionPx,
  TITLE_MAX_PX,
  DESC_MAX_PX,
  TITLE_MIN_PX,
  DESC_MIN_PX,
} from "@/lib/seo/text-width";
import { fetchRecentArticles } from "@/lib/services/shopify-client";
import { buildShopifyCreds } from "@/lib/services/platform-client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type IssueSeverity = "critical" | "warning" | "notice";
export type IssueCategory = "meta" | "content" | "technical" | "links" | "images" | "schema" | "performance";

export interface RawIssue {
  pageUrl: string | null;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  autoFixable: boolean;
  fixPayload?: Record<string, unknown>;
}

export interface CategoryScores {
  meta: number;
  content: number;
  technical: number;
  links: number;
  images: number;
}

export interface ScanResult {
  overallScore: number;
  metaScore: number;
  contentScore: number;
  technicalScore: number;
  linkScore: number;
  imageScore: number;
  pagesCrawled: number;
  issuesFound: number;
  criticalIssues: number;
  warnings: number;
  notices: number;
  issues: RawIssue[];
  scanDurationMs: number;
  rawData: Record<string, unknown>;
}

// ─── Blog descriptor (subset of DB row) ─────────────────────────────────────

export interface BlogDescriptor {
  id: string;
  platform: "wordpress" | "shopify";
  domain: string;
  // WordPress
  wpUrl?: string | null;
  wpUsername?: string | null;
  wpAppPassword?: string | null;
  seoPlugin?: string | null;
  // Shopify (both auth modes supported — legacy token + Dev Dashboard
  // client_credentials, which is what new blogs use).
  shopifyStoreUrl?: string | null;
  shopifyAdminApiToken?: string | null;
  shopifyAuthMode?: "legacy_token" | "client_credentials" | null;
  shopifyClientId?: string | null;
  shopifyClientSecret?: string | null;
  shopifyBlogHandle?: string | null;
}

// ─── Scoring constants ───────────────────────────────────────────────────────

const PENALTY: Record<IssueSeverity, number> = {
  critical: 12,
  warning: 5,
  notice: 2,
};

function scoreFromIssues(issues: RawIssue[], category: IssueCategory): number {
  const relevant = issues.filter((i) => i.category === category);
  const penalty = relevant.reduce((acc, i) => acc + PENALTY[i.severity], 0);
  return Math.max(0, 100 - penalty);
}

function overallFromCategories(scores: CategoryScores): number {
  const { meta, content, technical, links, images } = scores;
  // Weighted average
  const weighted =
    meta * 0.25 +
    content * 0.30 +
    technical * 0.20 +
    links * 0.15 +
    images * 0.10;
  return Math.round(weighted);
}

// ─── WordPress scanner ───────────────────────────────────────────────────────

interface WpPost {
  id: number;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  yoast_head_json?: {
    title?: string;
    description?: string;
    og_title?: string;
    canonical?: string;
  };
  // RankMath / generic
  rank_math_seo_score?: number;
  meta?: Record<string, string>;
}

async function fetchWpPosts(blog: BlogDescriptor, maxPages = 3): Promise<WpPost[]> {
  const base = (blog.wpUrl || `https://${blog.domain}`).replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (blog.wpUsername && blog.wpAppPassword) {
    const creds = Buffer.from(`${blog.wpUsername}:${blog.wpAppPassword}`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  }

  const posts: WpPost[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${base}/wp-json/wp/v2/posts?per_page=10&page=${page}&_fields=id,link,title,content,excerpt,yoast_head_json,meta`;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) break;
      const batch: WpPost[] = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      posts.push(...batch);
    } catch {
      break;
    }
  }

  return posts;
}

function analyzeWpPost(post: WpPost): RawIssue[] {
  const issues: RawIssue[] = [];
  const url = post.link;
  const yoast = post.yoast_head_json;

  // ── Meta title ──
  const metaTitle = yoast?.title || post.title?.rendered || "";
  if (!metaTitle) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "critical",
      title: "Missing meta title",
      description: "This post has no meta title, which severely impacts search rankings.",
      autoFixable: true,
      fixPayload: { type: "wp_meta_title", postId: post.id, pageUrl: url },
    });
  } else if (measureTitlePx(metaTitle) < TITLE_MIN_PX) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "warning",
      title: "Meta title too short",
      description: `Meta title renders at ${Math.round(measureTitlePx(metaTitle))}px. Aim for ${TITLE_MIN_PX}–${TITLE_MAX_PX}px.`,
      autoFixable: true,
      fixPayload: { type: "wp_meta_title", postId: post.id, currentTitle: metaTitle, pageUrl: url },
    });
  } else if (measureTitlePx(metaTitle) > TITLE_MAX_PX) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "warning",
      title: "Meta title too long",
      description: `Meta title renders at ${Math.round(measureTitlePx(metaTitle))}px. Keep it under ${TITLE_MAX_PX}px to avoid truncation.`,
      autoFixable: true,
      fixPayload: { type: "wp_meta_title", postId: post.id, currentTitle: metaTitle, pageUrl: url },
    });
  }

  // ── Meta description ──
  const metaDesc = yoast?.description || "";
  if (!metaDesc) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "critical",
      title: "Missing meta description",
      description: "No meta description found. Search engines may generate one automatically, often poorly.",
      autoFixable: true,
      fixPayload: { type: "wp_meta_description", postId: post.id, pageUrl: url },
    });
  } else if (measureDescriptionPx(metaDesc) < DESC_MIN_PX) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "warning",
      title: "Meta description too short",
      description: `Meta description renders at ${Math.round(measureDescriptionPx(metaDesc))}px. Aim for ${DESC_MIN_PX}–${DESC_MAX_PX}px.`,
      autoFixable: false,
    });
  } else if (measureDescriptionPx(metaDesc) > DESC_MAX_PX) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "warning",
      title: "Meta description too long",
      description: `Meta description renders at ${Math.round(measureDescriptionPx(metaDesc))}px — will be truncated in SERPs.`,
      autoFixable: true,
      fixPayload: { type: "wp_meta_description", postId: post.id, currentDesc: metaDesc, pageUrl: url },
    });
  }

  // ── Content analysis ──
  const rawHtml = post.content?.rendered || "";
  const textContent = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;

  if (wordCount < 300) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "critical",
      title: "Thin content",
      description: `Post has only ${wordCount} words. Google may consider this thin content (< 300 words).`,
      autoFixable: false,
    });
  } else if (wordCount < 600) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "warning",
      title: "Short content",
      description: `Post has ${wordCount} words. Longer posts (600+) tend to rank better.`,
      autoFixable: false,
    });
  }

  // ── H1 checks ──
  const h1Matches = rawHtml.match(/<h1[^>]*>/gi) || [];
  if (h1Matches.length === 0) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "critical",
      title: "Missing H1 tag",
      description: "No H1 heading found in this post's content.",
      autoFixable: false,
    });
  } else if (h1Matches.length > 1) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "warning",
      title: "Multiple H1 tags",
      description: `Found ${h1Matches.length} H1 tags. Use exactly one H1 per page.`,
      autoFixable: false,
    });
  }

  // ── Image alt text ──
  const imgMatches = [...rawHtml.matchAll(/<img[^>]+>/gi)];
  const imgsWithoutAlt = imgMatches.filter(
    ([tag]) => !tag.includes('alt="') || tag.match(/alt=""\s/),
  );
  if (imgsWithoutAlt.length > 0) {
    issues.push({
      pageUrl: url,
      category: "images",
      severity: "warning",
      title: `${imgsWithoutAlt.length} image${imgsWithoutAlt.length > 1 ? "s" : ""} missing alt text`,
      description: "Images without alt attributes hurt accessibility and image SEO.",
      autoFixable: false,
    });
  }

  // ── Canonical ──
  if (yoast && !yoast.canonical) {
    issues.push({
      pageUrl: url,
      category: "technical",
      severity: "notice",
      title: "No canonical URL set",
      description: "A canonical tag helps prevent duplicate content issues.",
      autoFixable: false,
    });
  }

  return issues;
}

export async function scanWordPressBlog(blog: BlogDescriptor): Promise<ScanResult> {
  const start = Date.now();
  const posts = await fetchWpPosts(blog);
  const allIssues: RawIssue[] = [];

  for (const post of posts) {
    allIssues.push(...analyzeWpPost(post));
  }

  // Blog-level technical checks
  const base = (blog.wpUrl || `https://${blog.domain}`).replace(/\/$/, "");
  try {
    const sitemapRes = await fetch(`${base}/sitemap.xml`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!sitemapRes.ok) {
      allIssues.push({
        pageUrl: base,
        category: "technical",
        severity: "warning",
        title: "Sitemap not found",
        description: "No sitemap.xml found at the root. A sitemap helps search engines index your content.",
        autoFixable: false,
      });
    }
  } catch {
    // network error — skip sitemap check
  }

  return buildResult(allIssues, posts.length, start);
}

// ─── Shopify scanner ─────────────────────────────────────────────────────────

interface ShopifyArticle {
  id: number;
  handle: string;
  title: string;
  body_html: string;
  summary_html: string | null;
  metafields?: Array<{ namespace: string; key: string; value: string }>;
}

async function fetchShopifyArticles(blog: BlogDescriptor, maxArticles = 30): Promise<ShopifyArticle[]> {
  // Route through the shared Shopify client so BOTH auth modes work — the old
  // raw-token fetch returned nothing for the client_credentials (Dev
  // Dashboard) blogs that make up the bulk of the network, so Shopify scans
  // silently found zero articles.
  const built = buildShopifyCreds({
    platform: "shopify",
    shopifyAuthMode: blog.shopifyAuthMode,
    shopifyStoreUrl: blog.shopifyStoreUrl,
    shopifyAdminApiToken: blog.shopifyAdminApiToken,
    shopifyClientId: blog.shopifyClientId,
    shopifyClientSecret: blog.shopifyClientSecret,
    shopifyBlogHandle: blog.shopifyBlogHandle,
  });
  if (!built.ok) return [];

  try {
    // Fetch just the most recent `maxArticles` in one request (vs. paginating
    // the whole blog). ShopifyArticle from the client carries everything the
    // analyzer reads: id, handle, title, body_html, summary_html.
    const articles = await fetchRecentArticles(
      built.creds,
      undefined,
      undefined,
      maxArticles,
    );
    return articles as ShopifyArticle[];
  } catch {
    return [];
  }
}

function shopifyArticleUrl(blog: BlogDescriptor, article: ShopifyArticle): string {
  const storeUrl = (blog.shopifyStoreUrl || `https://${blog.domain}`).replace(/\/$/, "");
  return `${storeUrl}/blogs/news/${article.handle}`;
}

function analyzeShopifyArticle(blog: BlogDescriptor, article: ShopifyArticle): RawIssue[] {
  const issues: RawIssue[] = [];
  const url = shopifyArticleUrl(blog, article);
  const rawHtml = article.body_html || "";
  const textContent = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = textContent.split(/\s+/).filter(Boolean).length;

  // ── Title checks ──
  if (!article.title) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "critical",
      title: "Missing article title",
      description: "Article has no title.",
      autoFixable: false,
    });
  } else if (article.title.length > 65) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "warning",
      title: "Article title too long",
      description: `Title is ${article.title.length} chars — may be truncated in SERPs.`,
      // Auto-fixable: writes a shorter global.title_tag metafield (the SEO
      // title the theme renders in <title>) via the API. Non-destructive —
      // the visible article title/handle is untouched.
      autoFixable: true,
      fixPayload: {
        type: "shopify_meta_title",
        articleId: article.id,
        articleTitle: article.title,
        excerpt: textContent.slice(0, 600),
        pageUrl: url,
      },
    });
  }

  // ── Excerpt / meta description ──
  if (!article.summary_html) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "warning",
      title: "Missing article excerpt",
      description: "Shopify uses the excerpt as meta description. Add one for better CTR.",
      // Auto-fixable: writes the global.description_tag metafield (the value
      // the theme actually renders as the meta description) via updateArticle.
      autoFixable: true,
      fixPayload: {
        type: "shopify_meta_description",
        articleId: article.id,
        articleTitle: article.title,
        excerpt: textContent.slice(0, 600),
        pageUrl: url,
      },
    });
  }

  // ── Content ──
  if (wordCount < 300) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "critical",
      title: "Thin content",
      description: `Article has only ${wordCount} words.`,
      autoFixable: false,
    });
  } else if (wordCount < 600) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "warning",
      title: "Short content",
      description: `Article has ${wordCount} words. Aim for 600+.`,
      autoFixable: false,
    });
  }

  // ── H1 ──
  const h1Count = (rawHtml.match(/<h1[^>]*>/gi) || []).length;
  if (h1Count === 0) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "warning",
      title: "Missing H1 tag",
      description: "No H1 found in article body. Shopify uses the title as H1, but verify your theme.",
      autoFixable: false,
    });
  }

  // ── Images ──
  const imgMatches = [...rawHtml.matchAll(/<img[^>]+>/gi)];
  const missingAlt = imgMatches.filter(
    ([tag]) => !tag.includes('alt="') || tag.match(/alt=""\s/),
  );
  if (missingAlt.length > 0) {
    issues.push({
      pageUrl: url,
      category: "images",
      severity: "warning",
      title: `${missingAlt.length} image${missingAlt.length > 1 ? "s" : ""} missing alt text`,
      description: "Images without alt attributes hurt image SEO and accessibility.",
      autoFixable: false,
    });
  }

  return issues;
}

export async function scanShopifyBlog(blog: BlogDescriptor): Promise<ScanResult> {
  const start = Date.now();
  const articles = await fetchShopifyArticles(blog);
  const allIssues: RawIssue[] = [];

  for (const article of articles) {
    allIssues.push(...analyzeShopifyArticle(blog, article));
  }

  return buildResult(allIssues, articles.length, start);
}

// ─── Unified entry point ─────────────────────────────────────────────────────

export async function scanBlog(blog: BlogDescriptor): Promise<ScanResult> {
  if (blog.platform === "shopify") {
    return scanShopifyBlog(blog);
  }
  return scanWordPressBlog(blog);
}

// ─── Result builder ──────────────────────────────────────────────────────────

export function buildResult(issues: RawIssue[], pagesCrawled: number, startMs: number): ScanResult {
  const metaScore = scoreFromIssues(issues, "meta");
  const contentScore = scoreFromIssues(issues, "content");
  const technicalScore = scoreFromIssues(issues, "technical");
  const linkScore = scoreFromIssues(issues, "links");
  const imageScore = scoreFromIssues(issues, "images");

  const overallScore = overallFromCategories({
    meta: metaScore,
    content: contentScore,
    technical: technicalScore,
    links: linkScore,
    images: imageScore,
  });

  const criticalIssues = issues.filter((i) => i.severity === "critical").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const notices = issues.filter((i) => i.severity === "notice").length;

  return {
    overallScore,
    metaScore,
    contentScore,
    technicalScore,
    linkScore,
    imageScore,
    pagesCrawled,
    issuesFound: issues.length,
    criticalIssues,
    warnings,
    notices,
    issues,
    scanDurationMs: Date.now() - startMs,
    rawData: { pagesCrawled, issueSummary: { criticalIssues, warnings, notices } },
  };
}