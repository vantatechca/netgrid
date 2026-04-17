// Enums matching database schema
export type UserRole = "super_admin" | "admin" | "client";
export type ClientStatus = "onboarding" | "active" | "paused" | "churned";
export type BillingType = "one_time" | "monthly" | "yearly";
export type BillingStatus = "active" | "overdue" | "paused" | "cancelled";
export type BlogStatus = "active" | "paused" | "setup" | "decommissioned";
export type SeoPlugin = "yoast" | "rankmath" | "none";
export type SeoCategory = "meta" | "content" | "technical" | "links" | "images" | "schema" | "performance";
export type IssueSeverity = "critical" | "warning" | "notice";
export type IssueStatus = "detected" | "queued" | "approved" | "applied" | "verified" | "dismissed" | "failed";
export type RenewalType = "domain" | "hosting" | "ssl";
export type AlertLevel = "info" | "warning" | "urgent" | "overdue";
export type MessageSenderRole = "admin" | "client" | "system";
export type SeoTrend = "improving" | "stable" | "declining";
export type InvoiceType = "setup" | "recurring" | "custom";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
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

// WP Connection test result
export interface WpConnectionResult {
  success: boolean;
  message: string;
  wpVersion?: string;
  seoPlugin?: SeoPlugin;
  userRole?: string;
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
