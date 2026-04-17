import { SEO_WEIGHTS } from "@/lib/constants";
import type { CrawlPageResult } from "./seo-crawler";

export interface BlogSeoScore {
  overall: number;
  meta: number;
  content: number;
  technical: number;
  links: number;
  images: number;
  pagesCrawled: number;
  issuesFound: number;
  criticalIssues: number;
  warnings: number;
  notices: number;
  issues: ScoredIssue[];
}

export interface ScoredIssue {
  pageUrl: string;
  category: keyof typeof SEO_WEIGHTS;
  severity: "critical" | "warning" | "notice";
  title: string;
  description: string;
  autoFixable: boolean;
}

export function scoreBlog(pages: CrawlPageResult[]): BlogSeoScore {
  if (pages.length === 0) {
    return {
      overall: 0, meta: 0, content: 0, technical: 0, links: 0, images: 0,
      pagesCrawled: 0, issuesFound: 0, criticalIssues: 0, warnings: 0, notices: 0, issues: [],
    };
  }

  const pageScores = pages.map(scorePage);

  // Average each category across all pages
  const avg = (key: keyof PageScore) =>
    Math.round(pageScores.reduce((sum, ps) => sum + ps[key], 0) / pageScores.length);

  const meta = avg("meta");
  const content = avg("content");
  const technical = avg("technical");
  const links = avg("links");
  const images = avg("images");

  // Weighted overall score
  const overall = Math.round(
    meta * SEO_WEIGHTS.meta +
    content * SEO_WEIGHTS.content +
    technical * SEO_WEIGHTS.technical +
    links * SEO_WEIGHTS.links +
    images * SEO_WEIGHTS.images +
    50 * SEO_WEIGHTS.external // Default external score since we don't crawl external
  );

  // Collect all issues
  const issues: ScoredIssue[] = [];
  for (const page of pages) {
    issues.push(...extractIssues(page));
  }

  const criticalIssues = issues.filter((i) => i.severity === "critical").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const notices = issues.filter((i) => i.severity === "notice").length;

  return {
    overall, meta, content, technical, links, images,
    pagesCrawled: pages.length,
    issuesFound: issues.length,
    criticalIssues, warnings, notices, issues,
  };
}

interface PageScore {
  meta: number;
  content: number;
  technical: number;
  links: number;
  images: number;
}

function scorePage(page: CrawlPageResult): PageScore {
  return {
    meta: scoreMetaCategory(page),
    content: scoreContentCategory(page),
    technical: scoreTechnicalCategory(page),
    links: scoreLinksCategory(page),
    images: scoreImagesCategory(page),
  };
}

function scoreMetaCategory(page: CrawlPageResult): number {
  let score = 100;
  const m = page.meta;

  if (!m.title) score -= 25;
  else if (m.titleLength < 30 || m.titleLength > 60) score -= 10;

  if (!m.metaDescription) score -= 25;
  else if (m.metaDescriptionLength < 120 || m.metaDescriptionLength > 160) score -= 10;

  if (!m.hasCanonical) score -= 15;
  if (!m.hasOgTitle) score -= 10;
  if (!m.hasOgDescription) score -= 10;
  if (!m.hasOgImage) score -= 10;

  return Math.max(0, score);
}

function scoreContentCategory(page: CrawlPageResult): number {
  let score = 100;
  const c = page.content;

  if (c.h1Count === 0) score -= 30;
  else if (c.h1Count > 1) score -= 15;

  if (!c.headingHierarchyValid) score -= 15;
  if (c.wordCount < 300) score -= 25;
  else if (c.wordCount < 600) score -= 10;

  if (c.headings.length < 3) score -= 10;

  return Math.max(0, score);
}

function scoreTechnicalCategory(page: CrawlPageResult): number {
  let score = 100;
  const t = page.technical;

  if (!t.hasViewportMeta) score -= 30;
  if (t.hasMixedContent) score -= 25;
  if (!t.hasStructuredData) score -= 20;
  if (page.loadTimeMs > 3000) score -= 15;
  else if (page.loadTimeMs > 2000) score -= 5;

  return Math.max(0, score);
}

function scoreLinksCategory(page: CrawlPageResult): number {
  let score = 100;
  const l = page.links;

  if (l.internalLinks === 0) score -= 40;
  else if (l.internalLinks < 3) score -= 20;

  if (l.brokenLinks.length > 0) score -= 10 * Math.min(l.brokenLinks.length, 5);

  return Math.max(0, score);
}

function scoreImagesCategory(page: CrawlPageResult): number {
  if (page.images.totalImages === 0) return 80; // No images, minor penalty

  const altRatio = page.images.imagesWithAlt / page.images.totalImages;
  let score = Math.round(altRatio * 100);

  if (page.images.largImages.length > 0) {
    score -= 5 * Math.min(page.images.largImages.length, 5);
  }

  return Math.max(0, score);
}

function extractIssues(page: CrawlPageResult): ScoredIssue[] {
  const issues: ScoredIssue[] = [];
  const url = page.url;

  // Meta issues
  for (const issue of page.meta.issues) {
    issues.push({
      pageUrl: url,
      category: "meta",
      severity: issue.includes("Missing title") || issue.includes("Missing meta description") ? "critical" : "warning",
      title: issue,
      description: `${issue} on ${url}`,
      autoFixable: issue.includes("meta description") || issue.includes("Open Graph"),
    });
  }

  // Content issues
  for (const issue of page.content.issues) {
    issues.push({
      pageUrl: url,
      category: "content",
      severity: issue.includes("Missing H1") ? "critical" : issue.includes("thin") ? "warning" : "notice",
      title: issue,
      description: `${issue} on ${url}`,
      autoFixable: false,
    });
  }

  // Technical issues
  for (const issue of page.technical.issues) {
    issues.push({
      pageUrl: url,
      category: "technical",
      severity: issue.includes("Mixed content") ? "critical" : issue.includes("viewport") ? "warning" : "notice",
      title: issue,
      description: `${issue} on ${url}`,
      autoFixable: false,
    });
  }

  // Link issues
  for (const issue of page.links.issues) {
    issues.push({
      pageUrl: url,
      category: "links",
      severity: "warning",
      title: issue,
      description: `${issue} on ${url}`,
      autoFixable: false,
    });
  }

  // Image issues
  for (const issue of page.images.issues) {
    issues.push({
      pageUrl: url,
      category: "images",
      severity: issue.includes("50%") ? "warning" : "notice",
      title: issue,
      description: `${issue} on ${url}`,
      autoFixable: issue.includes("alt text"),
    });
  }

  return issues;
}
