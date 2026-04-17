// SEO Category Weights (must sum to 1.0)
export const SEO_WEIGHTS = {
  meta: 0.20,
  content: 0.25,
  technical: 0.20,
  links: 0.15,
  images: 0.10,
  external: 0.10,
} as const;

export const SEO_CATEGORIES = Object.keys(SEO_WEIGHTS) as (keyof typeof SEO_WEIGHTS)[];

// SEO Score Ranges
export const SEO_SCORE_RANGES = [
  { min: 90, max: 100, label: "Excellent", color: "text-green-700", bg: "bg-green-100" },
  { min: 80, max: 89, label: "Good", color: "text-green-600", bg: "bg-green-50" },
  { min: 70, max: 79, label: "Fair", color: "text-yellow-600", bg: "bg-yellow-50" },
  { min: 60, max: 69, label: "Needs Work", color: "text-yellow-700", bg: "bg-yellow-100" },
  { min: 40, max: 59, label: "Poor", color: "text-orange-600", bg: "bg-orange-100" },
  { min: 0, max: 39, label: "Critical", color: "text-red-600", bg: "bg-red-100" },
] as const;

// Renewal Alert Thresholds (days)
export const RENEWAL_THRESHOLDS = [
  { days: 30, level: "info" as const },
  { days: 14, level: "warning" as const },
  { days: 7, level: "urgent" as const },
  { days: 0, level: "overdue" as const },
];

// Invoice Reminder Schedule (days after due date)
export const INVOICE_REMINDER_DAYS = [1, 7, 14, 30];

// Post Verification Alert Escalation
export const POST_ALERT_LEVELS = {
  warning: 1,   // 1x missed threshold
  urgent: 2,    // 2x missed threshold
  critical: 3,  // 3x missed threshold
} as const;

// Crawler Defaults
export const CRAWLER_DEFAULTS = {
  delayMs: 2000,
  maxConcurrent: 5,
  userAgent: "NetGrid-SEO-Monitor/1.0 (+https://netgrid.app)",
  maxPagesPerBlog: 50,
  requestTimeoutMs: 10000,
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Magic Link
export const MAGIC_LINK_EXPIRY_MINUTES = 15;
export const CLIENT_SESSION_DAYS = 7;

// Invoice Number Prefix
export const INVOICE_PREFIX = "NG";
