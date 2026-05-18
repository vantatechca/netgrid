import axios from "axios";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_TIMEOUT_MS = 60_000; // PSI is intentionally slow — give it room

export type PageSpeedStrategy = "mobile" | "desktop";

export interface PageSpeedResult {
  url: string;
  strategy: PageSpeedStrategy;
  fetchedAt: string;
  /** All scores are 0–100 (Lighthouse returns 0–1). null if PSI couldn't compute it. */
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  /** Core Web Vitals + helper metrics, all in their native units (ms / score). */
  vitals: {
    lcp?: number;        // Largest Contentful Paint (ms) — good < 2500
    fcp?: number;        // First Contentful Paint (ms)
    cls?: number;        // Cumulative Layout Shift (unitless × 1000) — good < 100
    tbt?: number;        // Total Blocking Time (ms)
    inp?: number;        // Interaction to Next Paint (ms)
    speedIndex?: number; // Speed Index (ms)
  };
  /** Failed Lighthouse audits, ranked worst-first. Cap at 20 to keep payload sane. */
  failedAudits: Array<{
    id: string;
    title: string;
    description: string;
    score: number | null; // 0..1
    displayValue?: string; // e.g. "5.4 s" or "0.18"
  }>;
  /** Set if the PSI call failed end-to-end. */
  error?: string;
}

interface LighthouseAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue?: string;
  numericValue?: number;
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, { score: number | null }>;
    audits?: Record<string, LighthouseAudit>;
  };
}

/**
 * Run a Lighthouse audit on `url` via Google's PageSpeed Insights API.
 * Returns scores + Core Web Vitals + failed audits in a normalized shape.
 *
 * Authentication: optional. If GOOGLE_PAGESPEED_API_KEY is set, it's used
 * (25,000 requests/day quota). Without a key, the unauthenticated tier is
 * very limited (~50 requests / 100 seconds per IP) — fine for occasional
 * tests, not for a daily cron over many blogs.
 */
export async function runPageSpeedAudit(
  url: string,
  strategy: PageSpeedStrategy = "mobile",
): Promise<PageSpeedResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;

  try {
    const response = await axios.get<PsiResponse>(PSI_ENDPOINT, {
      timeout: PSI_TIMEOUT_MS,
      params: {
        url,
        strategy,
        category: ["performance", "accessibility", "best-practices", "seo"],
        ...(apiKey ? { key: apiKey } : {}),
      },
      // Repeat the `category` param instead of rendering it as `category[]=…`
      paramsSerializer: { indexes: null },
    });

    const lh = response.data.lighthouseResult;
    if (!lh || !lh.audits) {
      return errorResult(url, strategy, "Lighthouse data missing in PSI response");
    }

    return {
      url,
      strategy,
      fetchedAt: new Date().toISOString(),
      scores: {
        performance: pct(lh.categories?.performance?.score),
        accessibility: pct(lh.categories?.accessibility?.score),
        bestPractices: pct(lh.categories?.["best-practices"]?.score),
        seo: pct(lh.categories?.seo?.score),
      },
      vitals: extractVitals(lh.audits),
      failedAudits: extractFailedAudits(lh.audits),
    };
  } catch (err) {
    const message = axios.isAxiosError(err)
      ? err.response
        ? `PSI ${err.response.status}: ${err.response.statusText}`
        : err.message
      : err instanceof Error
        ? err.message
        : "PSI request failed";
    return errorResult(url, strategy, message);
  }
}

function errorResult(
  url: string,
  strategy: PageSpeedStrategy,
  error: string,
): PageSpeedResult {
  return {
    url,
    strategy,
    fetchedAt: new Date().toISOString(),
    scores: {
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
    },
    vitals: {},
    failedAudits: [],
    error,
  };
}

function pct(score: number | null | undefined): number | null {
  if (score === null || score === undefined) return null;
  return Math.round(score * 100);
}

function num(audit: LighthouseAudit | undefined): number | undefined {
  if (!audit || typeof audit.numericValue !== "number") return undefined;
  return Math.round(audit.numericValue);
}

function extractVitals(audits: Record<string, LighthouseAudit>) {
  return {
    lcp: num(audits["largest-contentful-paint"]),
    fcp: num(audits["first-contentful-paint"]),
    cls: num(audits["cumulative-layout-shift"]),
    tbt: num(audits["total-blocking-time"]),
    inp: num(audits["interaction-to-next-paint"]),
    speedIndex: num(audits["speed-index"]),
  };
}

function extractFailedAudits(
  audits: Record<string, LighthouseAudit>,
): PageSpeedResult["failedAudits"] {
  return Object.values(audits)
    .filter((a) => typeof a.score === "number" && a.score < 0.9)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 20)
    .map((a) => ({
      id: a.id,
      title: a.title,
      description: (a.description || "").slice(0, 500),
      score: a.score,
      displayValue: a.displayValue,
    }));
}

/**
 * Map a Lighthouse audit score (0..1) to one of our internal severities.
 *   0           → critical
 *   < 0.5       → warning
 *   < 0.9       → notice
 *   >= 0.9      → not an issue (filtered out earlier)
 */
export function severityFromAuditScore(
  score: number | null,
): "critical" | "warning" | "notice" {
  if (score === null || score === 0) return "critical";
  if (score < 0.5) return "warning";
  return "notice";
}