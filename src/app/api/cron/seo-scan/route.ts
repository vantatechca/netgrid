import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { blogs, seoScans, seoIssues } from "@/lib/db/schema";
import { and, asc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { crawlBlog } from "@/lib/services/seo-crawler";
import { scoreBlog } from "@/lib/services/seo-scorer";
import {
  runPageSpeedAudit,
  severityFromAuditScore,
} from "@/lib/services/pagespeed-client";

// Per-scan ~50s (PageSpeed dominates). With concurrency=4 and a batch
// of 12 the run is dominated by PSI latency, not sequential time. 300s
// gives ample margin for slow PSI / retry.
export const maxDuration = 300;

type BlogRow = typeof blogs.$inferSelect;

function scanUrlFor(blog: BlogRow): string | null {
  const raw = blog.platform === "shopify" ? blog.shopifyStoreUrl : blog.wpUrl;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface ScanOutcome {
  blogId: string;
  domain: string;
  status: "scanned" | "skipped" | "failed";
  score?: number;
  issues?: number;
  pages?: number;
  durationMs?: number;
  message?: string;
}

/**
 * Scan one blog end-to-end (crawl + PSI + DB writes). Returns a
 * structured outcome so the batch caller can summarise without
 * re-throwing.
 */
async function scanOneBlog(blog: BlogRow): Promise<ScanOutcome> {
  const scanUrl = scanUrlFor(blog);
  if (!scanUrl) {
    return {
      blogId: blog.id,
      domain: blog.domain,
      status: "skipped",
      message: `no scannable URL for platform ${blog.platform}`,
    };
  }

  const startTime = Date.now();
  try {
    const [pagesResult, pagespeedResult] = await Promise.allSettled([
      crawlBlog(scanUrl, 20),
      runPageSpeedAudit(scanUrl, "mobile"),
    ]);

    const pages =
      pagesResult.status === "fulfilled" ? pagesResult.value : [];
    if (pagesResult.status === "rejected") {
      console.error(
        `[seo-scan] crawler failed for ${scanUrl}:`,
        pagesResult.reason,
      );
    }

    const pagespeed =
      pagespeedResult.status === "fulfilled"
        ? pagespeedResult.value
        : {
            scores: {
              seo: null,
              performance: null,
              accessibility: null,
              bestPractices: null,
            },
            vitals: {},
            failedAudits: [],
            error:
              pagespeedResult.status === "rejected"
                ? pagespeedResult.reason instanceof Error
                  ? pagespeedResult.reason.message
                  : String(pagespeedResult.reason)
                : null,
          };
    if (pagespeedResult.status === "rejected") {
      console.error(
        `[seo-scan] PSI failed for ${scanUrl}:`,
        pagespeedResult.reason,
      );
    }

    const scores = scoreBlog(pages);
    const duration = Date.now() - startTime;
    const displayedScore = pagespeed.scores.seo ?? scores.overall;

    const [scan] = await db
      .insert(seoScans)
      .values({
        blogId: blog.id,
        clientId: blog.clientId,
        overallScore: displayedScore,
        metaScore: scores.meta,
        contentScore: scores.content,
        technicalScore: pagespeed.scores.performance ?? scores.technical,
        linkScore: scores.links,
        imageScore: scores.images,
        pagesCrawled: scores.pagesCrawled,
        issuesFound: scores.issuesFound + pagespeed.failedAudits.length,
        criticalIssues: scores.criticalIssues,
        warnings: scores.warnings,
        notices: scores.notices,
        rawData: { pages, pagespeed },
        scanDurationMs: duration,
      })
      .returning();

    if (scores.issues.length > 0) {
      await db.insert(seoIssues).values(
        scores.issues.map((issue) => ({
          scanId: scan.id,
          blogId: blog.id,
          clientId: blog.clientId,
          pageUrl: issue.pageUrl,
          category: issue.category as
            | "meta"
            | "content"
            | "technical"
            | "links"
            | "images"
            | "schema"
            | "performance",
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          autoFixable: issue.autoFixable,
          status: "detected" as const,
        })),
      );
    }

    if (pagespeed.failedAudits.length > 0) {
      await db.insert(seoIssues).values(
        pagespeed.failedAudits.map((audit) => ({
          scanId: scan.id,
          blogId: blog.id,
          clientId: blog.clientId,
          pageUrl: scanUrl,
          category: "performance" as const,
          severity: severityFromAuditScore(audit.score),
          title: audit.title,
          description: audit.displayValue
            ? `${audit.description} (current: ${audit.displayValue})`
            : audit.description,
          autoFixable: false,
          status: "detected" as const,
        })),
      );
    }

    await db
      .update(blogs)
      .set({
        currentSeoScore: displayedScore,
        lastSeoScanAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(blogs.id, blog.id));

    return {
      blogId: blog.id,
      domain: blog.domain,
      status: "scanned",
      score: displayedScore,
      issues: scores.issuesFound + pagespeed.failedAudits.length,
      pages: scores.pagesCrawled,
      durationMs: duration,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown scan error";
    console.error(`[seo-scan] hard fail for ${blog.domain}:`, err);
    return {
      blogId: blog.id,
      domain: blog.domain,
      status: "failed",
      message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run an async function over an array with a parallelism cap. Each item
 * starts as soon as a slot opens. Returns results in completion order.
 */
async function runInParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const r = await fn(items[i]);
      results.push(r);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function clampInt(
  v: string | undefined | null,
  min: number,
  max: number,
  def: number,
): number {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-run controls. Defaults tuned to fit comfortably in maxDuration=300s
  // with a 4-way parallel PageSpeed dispatch (PSI free tier = 240 RPM, so
  // 4 concurrent calls is safe). Override via query param when triggering
  // manually, or via env var to change the default for the cron service.
  // Hardcaps: limit 1..50, concurrency 1..8.
  const url = new URL(request.url);
  const batchSize = clampInt(
    url.searchParams.get("limit") ?? process.env.SEO_SCAN_BATCH_SIZE ?? "12",
    1,
    50,
    12,
  );
  const concurrency = clampInt(
    url.searchParams.get("concurrency") ??
      process.env.SEO_SCAN_CONCURRENCY ??
      "4",
    1,
    8,
    4,
  );

  // ONCE-PER-MONTH boundary. Compute the start of the current UTC
  // month — any blog whose lastSeoScanAt is BEFORE this timestamp is
  // eligible. Blogs already scanned this month are skipped so the
  // rush window doesn't double-scan anyone, and so the cron returns
  // "no eligible blogs" gracefully once the network is fully covered.
  //
  // Override via ?force=1 query param when manually triggering a
  // catch-up scan (useful after fixing a bug or onboarding new blogs
  // mid-month).
  const now = new Date();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const force = url.searchParams.get("force") === "1";

  try {
    // Pick the N oldest-scanned active blogs that have *some* scannable URL
    // AND haven't been scanned this calendar month yet (unless force=1).
    // Sort by lastSeoScanAt ASC NULLS FIRST so brand-new blogs (never
    // scanned) go to the front of the line.
    const candidates = await db
      .select()
      .from(blogs)
      .where(
        and(
          eq(blogs.status, "active"),
          or(isNotNull(blogs.wpUrl), isNotNull(blogs.shopifyStoreUrl)),
          force
            ? sql`true`
            : or(
                sql`${blogs.lastSeoScanAt} IS NULL`,
                lt(blogs.lastSeoScanAt, startOfMonth),
              ),
        ),
      )
      .orderBy(
        asc(sql`coalesce(${blogs.lastSeoScanAt}, '1970-01-01')`),
        asc(blogs.id),
      )
      .limit(batchSize);

    if (candidates.length === 0) {
      return NextResponse.json({
        message: force
          ? "No blogs to scan (force=1 — DB is empty or no eligible blogs)"
          : `All active blogs already scanned this month (since ${startOfMonth.toISOString()}). Use ?force=1 to override.`,
        batchSize,
        concurrency,
        force,
        startOfMonth: startOfMonth.toISOString(),
      });
    }

    const startedAt = Date.now();
    const outcomes = await runInParallel(candidates, concurrency, scanOneBlog);
    const totalDurationMs = Date.now() - startedAt;

    const scanned = outcomes.filter((o) => o.status === "scanned").length;
    const skipped = outcomes.filter((o) => o.status === "skipped").length;
    const failed = outcomes.filter((o) => o.status === "failed").length;

    console.info(
      `[seo-scan] batch complete in ${totalDurationMs}ms — ` +
        `scanned=${scanned} skipped=${skipped} failed=${failed} ` +
        `(batchSize=${batchSize}, concurrency=${concurrency})`,
    );

    return NextResponse.json({
      considered: candidates.length,
      scanned,
      skipped,
      failed,
      batchSize,
      concurrency,
      totalDurationMs,
      force,
      startOfMonth: startOfMonth.toISOString(),
      results: outcomes,
    });
  } catch (error) {
    console.error("SEO scan cron error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown scan error";
    return NextResponse.json(
      {
        error: "Scan batch failed",
        message,
        ...(error instanceof Error &&
        error.stack &&
        process.env.NODE_ENV !== "production"
          ? { stack: error.stack.split("\n").slice(0, 8) }
          : {}),
      },
      { status: 500 },
    );
  }
}
