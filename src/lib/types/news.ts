/**
 * Shared types for the news + report-email modules.
 *
 * Lives outside any "use server" file so server-action validators
 * don't reject non-async exports. Both server and client code can
 * import from here safely.
 */

export interface RefreshNewsResult {
  verticalKey: string;
  queries: number;
  fetched: number;
  inserted: number;
  errors: string[];
}

export interface NewsContextItem {
  id: string;
  title: string;
  publisher: string | null;
  publishedAt: Date | null;
  snippet: string | null;
  link: string;
}

export interface EmailReportResult {
  success: boolean;
  message: string;
  /** Resend message id on success (or "dev-log" in local dev). */
  emailId?: string;
}
