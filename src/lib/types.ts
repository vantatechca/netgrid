// Enums matching database schema
export type UserRole = "super_admin" | "admin" | "client";
export type ClientStatus = "onboarding" | "active" | "paused" | "churned";
export type BlogStatus = "active" | "paused" | "setup" | "decommissioned";
export type SeoPlugin = "yoast" | "rankmath" | "none";
export type Platform = "wordpress" | "shopify";
export type SeoCategory = "meta" | "content" | "technical" | "links" | "images" | "schema" | "performance";
export type IssueSeverity = "critical" | "warning" | "notice";
export type IssueStatus = "detected" | "queued" | "approved" | "applied" | "verified" | "dismissed" | "failed";
export type MessageSenderRole = "admin" | "client" | "system";
export type SeoTrend = "improving" | "stable" | "declining";
export type CheckType = "scheduled" | "manual";
export type ThirdPartySource = "ahrefs" | "semrush" | "moz";

// Dashboard stat card
export interface StatCard {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: string;
}

// SEO Score breakdown
export interface SeoScoreBreakdown {
  overall: number;
  meta: number;
  content: number;
  technical: number;
  links: number;
  images: number;
}

// Fix payload for WP REST API calls
export interface FixPayload {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}

// CSV import result
export interface CsvImportResult {
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

// Platform connection test result (WordPress or Shopify)
export interface ConnectionResult {
  success: boolean;
  message: string;
  platform?: Platform;
  wpVersion?: string;
  seoPlugin?: SeoPlugin;
  userRole?: string;
  shopifyStoreName?: string;
  shopifyPlan?: string;
}

// Back-compat alias — older code imports WpConnectionResult
export type WpConnectionResult = ConnectionResult;

// Generic post input for publishing
export interface PublishPostInput {
  title: string;
  content: string;
  excerpt?: string;
  status?: "draft" | "publish";
  tags?: string[];
  featuredImageUrl?: string;
  /**
   * SEO meta title (title tag). Written to the platform's SEO fields:
   * Shopify → article metafield `global.title_tag`; WordPress → Yoast /
   * RankMath title (routed by the blog's seoPlugin). Falls back to `title`
   * for rendering when absent.
   */
  metaTitle?: string;
  /**
   * SEO meta description. Written to the platform's SEO fields: Shopify →
   * article metafield `global.description_tag`; WordPress → Yoast /
   * RankMath description. When absent, the platform falls back to an
   * excerpt or auto-generated snippet.
   */
  metaDescription?: string;
}

export interface PublishPostResult {
  success: boolean;
  message: string;
  postId?: string | number;
  postUrl?: string;
}

// Activity log entry details
export interface ActivityDetails {
  [key: string]: unknown;
}

// Report highlights/concerns
export interface ReportHighlight {
  blogDomain: string;
  description: string;
  scoreChange?: number;
}

// Top keywords from third-party data
export interface TopKeyword {
  keyword: string;
  position: number;
  volume: number;
  url: string;
}
