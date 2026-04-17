import axios from "axios";
import * as cheerio from "cheerio";
import { CRAWLER_DEFAULTS } from "@/lib/constants";

export interface CrawlPageResult {
  url: string;
  statusCode: number;
  loadTimeMs: number;
  meta: MetaAnalysis;
  content: ContentAnalysis;
  technical: TechnicalAnalysis;
  links: LinkAnalysis;
  images: ImageAnalysis;
}

interface MetaAnalysis {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  hasCanonical: boolean;
  canonicalUrl: string | null;
  hasOgTitle: boolean;
  hasOgDescription: boolean;
  hasOgImage: boolean;
  issues: string[];
}

interface ContentAnalysis {
  h1Count: number;
  h1Text: string | null;
  headingHierarchyValid: boolean;
  headings: { level: number; text: string }[];
  wordCount: number;
  issues: string[];
}

interface TechnicalAnalysis {
  hasViewportMeta: boolean;
  hasMixedContent: boolean;
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  issues: string[];
}

interface LinkAnalysis {
  internalLinks: number;
  externalLinks: number;
  brokenLinks: string[];
  issues: string[];
}

interface ImageAnalysis {
  totalImages: number;
  imagesWithAlt: number;
  imagesWithoutAlt: string[];
  largImages: string[];
  issues: string[];
}

export async function crawlPage(url: string): Promise<CrawlPageResult> {
  const start = Date.now();

  const response = await axios.get(url, {
    timeout: CRAWLER_DEFAULTS.requestTimeoutMs,
    headers: { "User-Agent": CRAWLER_DEFAULTS.userAgent },
    maxRedirects: 3,
    validateStatus: () => true,
  });

  const loadTimeMs = Date.now() - start;
  const html = response.data as string;
  const $ = cheerio.load(html);

  return {
    url,
    statusCode: response.status,
    loadTimeMs,
    meta: analyzeMeta($),
    content: analyzeContent($),
    technical: analyzeTechnical($, html),
    links: analyzeLinks($, url),
    images: analyzeImages($),
  };
}

function analyzeMeta($: cheerio.CheerioAPI): MetaAnalysis {
  const title = $("title").text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const canonical = $('link[rel="canonical"]').attr("href") || null;
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDescription = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");

  const issues: string[] = [];

  if (!title) issues.push("Missing title tag");
  else if (title.length < 30) issues.push("Title tag too short (under 30 chars)");
  else if (title.length > 60) issues.push("Title tag too long (over 60 chars)");

  if (!metaDescription) issues.push("Missing meta description");
  else if (metaDescription.length < 120) issues.push("Meta description too short (under 120 chars)");
  else if (metaDescription.length > 160) issues.push("Meta description too long (over 160 chars)");

  if (!canonical) issues.push("Missing canonical tag");
  if (!ogTitle) issues.push("Missing Open Graph title");
  if (!ogDescription) issues.push("Missing Open Graph description");
  if (!ogImage) issues.push("Missing Open Graph image");

  return {
    title,
    titleLength: title?.length || 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length || 0,
    hasCanonical: !!canonical,
    canonicalUrl: canonical,
    hasOgTitle: !!ogTitle,
    hasOgDescription: !!ogDescription,
    hasOgImage: !!ogImage,
    issues,
  };
}

function analyzeContent($: cheerio.CheerioAPI): ContentAnalysis {
  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const tag = $(el).prop("tagName")?.toLowerCase() || "";
    const level = parseInt(tag.replace("h", ""), 10);
    headings.push({ level, text: $(el).text().trim() });
  });

  const h1Count = headings.filter((h) => h.level === 1).length;
  const h1Text = headings.find((h) => h.level === 1)?.text || null;

  // Check heading hierarchy (no skips: h1->h2->h3, not h1->h3)
  let hierarchyValid = true;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      hierarchyValid = false;
      break;
    }
  }

  // Word count (text content only, no scripts/styles)
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  const issues: string[] = [];
  if (h1Count === 0) issues.push("Missing H1 tag");
  else if (h1Count > 1) issues.push("Multiple H1 tags found");
  if (!hierarchyValid) issues.push("Heading hierarchy has gaps (e.g., H1 followed by H3)");
  if (wordCount < 300) issues.push("Content too thin (under 300 words)");

  return { h1Count, h1Text, headingHierarchyValid: hierarchyValid, headings, wordCount, issues };
}

function analyzeTechnical($: cheerio.CheerioAPI, html: string): TechnicalAnalysis {
  const hasViewportMeta = !!$('meta[name="viewport"]').length;
  const hasMixedContent = /http:\/\/[^"'\s]+\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)/i.test(html);

  // Check for structured data
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const structuredDataTypes: string[] = [];
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      if (data["@type"]) structuredDataTypes.push(data["@type"]);
    } catch { /* ignore malformed JSON-LD */ }
  });

  const issues: string[] = [];
  if (!hasViewportMeta) issues.push("Missing viewport meta tag (not mobile-friendly)");
  if (hasMixedContent) issues.push("Mixed content detected (HTTP resources on HTTPS page)");
  if (structuredDataTypes.length === 0) issues.push("No structured data/schema markup found");

  return {
    hasViewportMeta,
    hasMixedContent,
    hasStructuredData: structuredDataTypes.length > 0,
    structuredDataTypes,
    issues,
  };
}

function analyzeLinks($: cheerio.CheerioAPI, pageUrl: string): LinkAnalysis {
  const baseUrl = new URL(pageUrl);
  let internalLinks = 0;
  let externalLinks = 0;
  const issues: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    try {
      const linkUrl = new URL(href, pageUrl);
      if (linkUrl.hostname === baseUrl.hostname) {
        internalLinks++;
      } else {
        externalLinks++;
      }
    } catch { /* skip malformed URLs */ }
  });

  if (internalLinks === 0) issues.push("No internal links found on this page");
  if (internalLinks < 3) issues.push("Very few internal links (under 3)");

  return { internalLinks, externalLinks, brokenLinks: [], issues };
}

function analyzeImages($: cheerio.CheerioAPI): ImageAnalysis {
  const imagesWithoutAlt: string[] = [];
  const largImages: string[] = [];
  let totalImages = 0;
  let imagesWithAlt = 0;

  $("img").each((_, el) => {
    totalImages++;
    const alt = $(el).attr("alt");
    const src = $(el).attr("src") || $(el).attr("data-src") || "unknown";

    if (alt && alt.trim().length > 0) {
      imagesWithAlt++;
    } else {
      imagesWithoutAlt.push(src);
    }
  });

  const issues: string[] = [];
  if (imagesWithoutAlt.length > 0) {
    issues.push(`${imagesWithoutAlt.length} image(s) missing alt text`);
  }
  if (totalImages > 0 && imagesWithAlt / totalImages < 0.5) {
    issues.push("Less than 50% of images have alt text");
  }

  return { totalImages, imagesWithAlt, imagesWithoutAlt, largImages: largImages, issues };
}

// Crawl multiple pages of a blog (from sitemap or homepage links)
export async function crawlBlog(wpUrl: string, maxPages: number = CRAWLER_DEFAULTS.maxPagesPerBlog): Promise<CrawlPageResult[]> {
  const results: CrawlPageResult[] = [];
  const crawled = new Set<string>();
  const queue: string[] = [wpUrl];

  // Try to get sitemap URLs first
  try {
    const sitemapUrl = new URL("/sitemap_index.xml", wpUrl).toString();
    const sitemapRes = await axios.get(sitemapUrl, {
      timeout: 5000,
      headers: { "User-Agent": CRAWLER_DEFAULTS.userAgent },
      validateStatus: () => true,
    });

    if (sitemapRes.status === 200) {
      const $sitemap = cheerio.load(sitemapRes.data, { xml: true });
      $sitemap("loc").each((_, el) => {
        const url = $sitemap(el).text().trim();
        if (url && !crawled.has(url)) queue.push(url);
      });
    }
  } catch { /* sitemap not available, crawl from homepage */ }

  // Also try wp-sitemap.xml (WordPress default)
  if (queue.length <= 1) {
    try {
      const wpSitemapUrl = new URL("/wp-sitemap.xml", wpUrl).toString();
      const res = await axios.get(wpSitemapUrl, {
        timeout: 5000,
        headers: { "User-Agent": CRAWLER_DEFAULTS.userAgent },
        validateStatus: () => true,
      });
      if (res.status === 200) {
        const $s = cheerio.load(res.data, { xml: true });
        // Get sub-sitemaps
        $s("loc").each((_, el) => {
          const loc = $s(el).text().trim();
          if (loc) queue.push(loc);
        });
      }
    } catch { /* ignore */ }
  }

  for (const url of queue) {
    if (crawled.size >= maxPages) break;
    if (crawled.has(url)) continue;

    crawled.add(url);

    try {
      const result = await crawlPage(url);
      results.push(result);

      // Extract more links from this page if we need more URLs
      if (queue.length < maxPages) {
        const $ = cheerio.load((await axios.get(url, { timeout: 5000, validateStatus: () => true })).data);
        const baseHost = new URL(wpUrl).hostname;
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          try {
            const linkUrl = new URL(href, url);
            if (linkUrl.hostname === baseHost && !crawled.has(linkUrl.toString())) {
              queue.push(linkUrl.toString());
            }
          } catch { /* skip */ }
        });
      }

      // Respectful delay between requests
      await new Promise((resolve) => setTimeout(resolve, CRAWLER_DEFAULTS.delayMs));
    } catch {
      // Page couldn't be crawled, skip
    }
  }

  return results;
}
