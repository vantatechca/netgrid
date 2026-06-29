/**
 * lib/services/post-seo-scanner.ts
 *
 * Per-POST SEO scanner. Where seo-crawler/scanner walk a whole site (sitemap,
 * homepage, products, collections — the source of tens of thousands of noisy,
 * un-fixable issues), this scans exactly ONE published blog post and reports
 * only the things netgrid can actually own for that post:
 *
 *   - meta title    (present + pixel width)
 *   - meta description (present + pixel width)
 *   - H1 inside the body (the platform already renders the title as the H1)
 *   - duplicate headings WITHIN the article body
 *   - thin content
 *   - images missing alt text
 *   - canonical / Open Graph / JSON-LD presence  (rendered-page checks only)
 *
 * Two input sources, combined deliberately:
 *   • CONTENT checks (headings, images, word count) always run against the
 *     stored article BODY — never the live full-page DOM. That sidesteps the
 *     long-standing false positives from theme chrome (cart drawers, sidebars,
 *     repeated widget headings) that plagued the whole-page crawler.
 *   • META / head checks prefer the LIVE rendered <head> when the page is
 *     fetchable (so we see what the theme actually output), and fall back to
 *     the stored meta fields when it isn't (dev stores are password-walled).
 *
 * Fixable Shopify/WP meta issues carry the fixPayload shape the existing
 * fix-queue Apply path already understands (see seo-autofix.ts).
 */

import * as cheerio from "cheerio";
import {
  measureTitlePx,
  measureDescriptionPx,
  TITLE_MAX_PX,
  DESC_MAX_PX,
  TITLE_MIN_PX,
  DESC_MIN_PX,
} from "@/lib/seo/text-width";
import { buildResult, type RawIssue, type ScanResult } from "@/lib/seo/scanner";

export interface PostScanInput {
  platform: "wordpress" | "shopify";
  /** Canonical/public URL of the post — used as the issue pageUrl. */
  pageUrl: string;
  /** External post id: Shopify article id / WP post id. Drives Apply. */
  articleId: string | null;
  articleTitle: string | null;
  /** Stored article body HTML (content the generator produced). */
  body: string | null;
  /** Stored meta title (already px-capped at generation). */
  metaTitle: string | null;
  /** Stored meta description (already px-capped at generation). */
  metaDescription: string | null;
  /** Live page HTML if a fetch succeeded; null when blocked/unavailable. */
  liveHtml?: string | null;
}

export interface PostScanResult extends ScanResult {
  /** Where the meta values were read from for this scan. */
  metaSource: "live" | "stored";
}

/** Collapse whitespace and lowercase so heading variants compare equal. */
function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function plainTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

/**
 * Content checks against the article BODY only (no page chrome). Produces
 * issues for thin content, stray H1s, duplicate headings, and missing alt.
 */
function analyzeBody(input: PostScanInput): RawIssue[] {
  const issues: RawIssue[] = [];
  const url = input.pageUrl;
  const html = input.body ?? "";
  if (!html.trim()) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "critical",
      title: "No stored body content",
      description:
        "This post has no stored body to analyze. Re-generate or re-publish it.",
      autoFixable: false,
    });
    return issues;
  }

  const $ = cheerio.load(html);

  // ── Word count ──
  const wordCount = plainTextFromHtml(html).split(/\s+/).filter(Boolean).length;
  if (wordCount < 300) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "critical",
      title: "Thin content",
      description: `Post body has only ${wordCount} words. Google may treat under 300 words as thin content.`,
      autoFixable: false,
    });
  } else if (wordCount < 600) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "warning",
      title: "Short content",
      description: `Post body has ${wordCount} words. Longer posts (600+) tend to rank better.`,
      autoFixable: false,
    });
  }

  // ── Headings ──
  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag = ($(el).prop("tagName") || "").toLowerCase();
    const level = parseInt(tag.replace("h", ""), 10);
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) headings.push({ level, text });
  });

  // The platform renders the post TITLE as the page H1. A second H1 inside
  // the body competes with it — flag it (this is body-scoped, so theme chrome
  // never trips it the way the whole-page crawler did).
  const bodyH1s = headings.filter((h) => h.level === 1);
  if (bodyH1s.length > 0) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "warning",
      title: "Extra H1 in body",
      description: `The body contains ${bodyH1s.length} H1 heading${
        bodyH1s.length > 1 ? "s" : ""
      }. The page title is already the H1 — demote in-body headings to H2+.`,
      autoFixable: false,
    });
  }

  // Duplicate headings WITHIN the article (same text appearing 2+ times).
  const seen = new Map<string, number>();
  for (const h of headings) {
    const key = normalizeHeading(h.text);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) {
    const sample = dupes
      .slice(0, 3)
      .map(([t, n]) => `“${t}” ×${n}`)
      .join(", ");
    issues.push({
      pageUrl: url,
      category: "content",
      severity: "warning",
      title: `Duplicate heading${dupes.length > 1 ? "s" : ""} in body`,
      description: `Repeated heading text inside the article: ${sample}. Make each heading unique.`,
      autoFixable: false,
    });
  }

  // ── Images missing alt ──
  let imgTotal = 0;
  let imgMissingAlt = 0;
  $("img").each((_, el) => {
    imgTotal++;
    const alt = $(el).attr("alt");
    if (!alt || !alt.trim()) imgMissingAlt++;
  });
  if (imgMissingAlt > 0) {
    issues.push({
      pageUrl: url,
      category: "images",
      severity: "warning",
      title: `${imgMissingAlt} image${imgMissingAlt > 1 ? "s" : ""} missing alt text`,
      description: `${imgMissingAlt} of ${imgTotal} image${
        imgTotal > 1 ? "s" : ""
      } in the body have no alt attribute. Alt text helps image SEO and accessibility.`,
      autoFixable: false,
    });
  }

  return issues;
}

/**
 * Meta/head checks. When live HTML is available we read the rendered <head>
 * (so theme-output problems surface); otherwise we fall back to the stored,
 * already-capped meta fields. Fixable meta issues carry the platform fixPayload.
 */
function analyzeMeta(
  input: PostScanInput,
): { issues: RawIssue[]; source: "live" | "stored" } {
  const issues: RawIssue[] = [];
  const url = input.pageUrl;
  const isShopify = input.platform === "shopify";

  // Build the fixPayload the Apply path expects (seo-autofix.ts.classifyFix).
  const metaDescPayload = (): Record<string, unknown> => ({
    type: isShopify ? "shopify_meta_description" : "wp_meta_description",
    articleId: input.articleId ?? undefined,
    postId:
      !isShopify && input.articleId ? Number(input.articleId) : undefined,
    articleTitle: input.articleTitle ?? undefined,
    excerpt: input.body
      ? plainTextFromHtml(input.body).slice(0, 600)
      : undefined,
    pageUrl: url,
  });
  const metaTitlePayload = (): Record<string, unknown> => ({
    type: isShopify ? "shopify_meta_title" : "wp_meta_title",
    articleId: input.articleId ?? undefined,
    postId:
      !isShopify && input.articleId ? Number(input.articleId) : undefined,
    articleTitle: input.articleTitle ?? undefined,
    pageUrl: url,
  });
  // Only offer auto-fix when we actually have a target id to write to.
  const fixable = input.articleId != null;

  let title: string | null;
  let description: string | null;
  let source: "live" | "stored";
  let canonical: string | null = null;
  let ogTitle = false;
  let ogDescription = false;
  let ogImage = false;
  let hasJsonLd = false;
  let headChecks = false;

  if (input.liveHtml && input.liveHtml.trim()) {
    const $ = cheerio.load(input.liveHtml);
    title = $("title").first().text().trim() || null;
    description =
      $('meta[name="description"]').attr("content")?.trim() || null;
    canonical = $('link[rel="canonical"]').attr("href")?.trim() || null;
    ogTitle = !!$('meta[property="og:title"]').attr("content");
    ogDescription = !!$('meta[property="og:description"]').attr("content");
    ogImage = !!$('meta[property="og:image"]').attr("content");
    hasJsonLd = $('script[type="application/ld+json"]').length > 0;
    source = "live";
    headChecks = true;
  } else {
    title = input.metaTitle?.trim() || null;
    description = input.metaDescription?.trim() || null;
    source = "stored";
  }

  // ── Meta title ──
  if (!title) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "critical",
      title: "Missing meta title",
      description: "No meta title found for this post — severely hurts ranking.",
      autoFixable: fixable,
      ...(fixable ? { fixPayload: metaTitlePayload() } : {}),
    });
  } else {
    const px = measureTitlePx(title);
    if (px > TITLE_MAX_PX) {
      issues.push({
        pageUrl: url,
        category: "meta",
        severity: "warning",
        title: "Meta title too long",
        description: `Meta title renders at ${Math.round(px)}px (over ${TITLE_MAX_PX}px) — it will be truncated in search results.`,
        autoFixable: fixable,
        ...(fixable ? { fixPayload: metaTitlePayload() } : {}),
      });
    } else if (px < TITLE_MIN_PX) {
      issues.push({
        pageUrl: url,
        category: "meta",
        severity: "notice",
        title: "Meta title too short",
        description: `Meta title renders at ${Math.round(px)}px (under ${TITLE_MIN_PX}px). Aim for ${TITLE_MIN_PX}–${TITLE_MAX_PX}px.`,
        autoFixable: fixable,
        ...(fixable ? { fixPayload: metaTitlePayload() } : {}),
      });
    }
  }

  // ── Meta description ──
  if (!description) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: "critical",
      title: "Missing meta description",
      description:
        "No meta description found for this post. Search engines will auto-generate one, often poorly.",
      autoFixable: fixable,
      ...(fixable ? { fixPayload: metaDescPayload() } : {}),
    });
  } else {
    const px = measureDescriptionPx(description);
    if (px > DESC_MAX_PX) {
      issues.push({
        pageUrl: url,
        category: "meta",
        severity: "warning",
        title: "Meta description too long",
        description: `Meta description renders at ${Math.round(px)}px (over ${DESC_MAX_PX}px) — it will be truncated in search results.`,
        autoFixable: fixable,
        ...(fixable ? { fixPayload: metaDescPayload() } : {}),
      });
    } else if (px < DESC_MIN_PX) {
      issues.push({
        pageUrl: url,
        category: "meta",
        severity: "notice",
        title: "Meta description too short",
        description: `Meta description renders at ${Math.round(px)}px (under ${DESC_MIN_PX}px). Aim for ${DESC_MIN_PX}–${DESC_MAX_PX}px.`,
        autoFixable: fixable,
        ...(fixable ? { fixPayload: metaDescPayload() } : {}),
      });
    }
  }

  // ── Rendered-page-only checks (skip when working from stored fields, since
  //    we can't see the head reliably and don't want false negatives). ──
  if (headChecks) {
    if (!canonical) {
      issues.push({
        pageUrl: url,
        category: "technical",
        severity: "notice",
        title: "Missing canonical tag",
        description:
          "No canonical URL on the rendered page. A canonical prevents duplicate-content dilution.",
        autoFixable: false,
      });
    }
    if (!ogTitle || !ogDescription || !ogImage) {
      const missing = [
        !ogTitle && "title",
        !ogDescription && "description",
        !ogImage && "image",
      ]
        .filter(Boolean)
        .join(", ");
      issues.push({
        pageUrl: url,
        category: "technical",
        severity: "notice",
        title: "Incomplete Open Graph tags",
        description: `Rendered page is missing Open Graph ${missing}. Social shares will look bare.`,
        autoFixable: false,
      });
    }
    if (!hasJsonLd) {
      issues.push({
        pageUrl: url,
        category: "schema",
        severity: "notice",
        title: "No structured data",
        description:
          "No JSON-LD schema found on the rendered page. Article schema helps rich results.",
        autoFixable: false,
      });
    }
  }

  return { issues, source };
}

/**
 * Scan a single published post. Pure (no DB / network) — the caller fetches
 * the live HTML (best effort) and persists the result.
 */
export function scanPost(input: PostScanInput): PostScanResult {
  const { issues: metaIssues, source } = analyzeMeta(input);
  const bodyIssues = analyzeBody(input);
  const all = [...metaIssues, ...bodyIssues];
  const result = buildResult(all, 1, Date.now());
  return { ...result, metaSource: source };
}
