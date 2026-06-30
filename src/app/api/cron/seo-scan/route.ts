import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { generatedPosts, seoScans, seoIssues } from "@/lib/db/schema";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { runPostSeoScan } from "@/lib/services/post-seo-runner";

// Per-post scans are cheap (one best-effort fetch + in-memory analysis), so a
// batch of 25 at concurrency 5 finishes well inside the budget. Generous
// ceiling kept for slow live fetches.
export const maxDuration = 300;

/**
 * SEO scan cron — REWORKED from a whole-site crawler (sitemap + PageSpeed,
 * which produced tens of thousands of un-fixable issues on products,
 * collections and sitemap files) to a per-POST catch-up scanner.
 *
 * Newly-published posts are scanned automatically at publish time
 * (scanPostAfterPublishFireAndForget). This cron is the safety net + one-time
 * backfill: it finds published posts that have NEVER had a per-post scan and
 * scans a batch of them each run, draining the historical backlog over time.
 *
 * Query params (all optional, cron-secret protected):
 *   ?limit=N        batch size           (default 25, 1..200)
 *   ?concurrency=N  parallelism          (default 5, 1..10)
 *   ?purge=1        ONE-TIME: delete open issues left by the old whole-site
 *                   crawler (anything NOT from a per-post scan). Preserves
 *                   applied/failed history. Run this once after deploy.
 *   ?reset=1        CLEAN SLATE: delete ALL seo_issues and seo_scans (every
 *                   client, every status) so tracking starts from zero. The
 *                   per-post scans then repopulate as posts are (re)scanned.
 *                   Destructive and irreversible — use to wipe the legacy data.
 */

interface PostOutcome {
  postId: string;
  status: "scanned" | "skipped" | "failed";
  score?: number;
  issues?: number;
  message?: string;
}

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
      results.push(await fn(items[i]));
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

/**
 * Clean slate — delete EVERY seo_issue and seo_scan so tracking restarts from
 * zero. Issues are removed first (they FK to scans), then scans. Returns the
 * counts removed. Irreversible; gated behind the cron secret + explicit
 * ?reset=1.
 */
async function resetAllSeoData(): Promise<{ issues: number; scans: number }> {
  const [{ issues }] = await db
    .select({ issues: count() })
    .from(seoIssues);
  const [{ scans }] = await db.select({ scans: count() }).from(seoScans);
  // Delete issues first (FK → scans), then the scans themselves.
  await db.delete(seoIssues);
  await db.delete(seoScans);
  return { issues: Number(issues), scans: Number(scans) };
}

/**
 * Delete OPEN issues that did NOT come from a per-post scan — i.e. the legacy
 * whole-site crawler's output. A per-post scan stamps its seo_scans row with
 * rawData.kind = 'post_scan'; everything else is the old crawler. Applied /
 * failed / verified / dismissed issues are kept as history.
 */
async function purgeCrawlerIssues(): Promise<number> {
  const deleted = await db
    .delete(seoIssues)
    .where(
      and(
        inArray(seoIssues.status, ["detected", "queued"]),
        sql`NOT EXISTS (
          SELECT 1 FROM ${seoScans}
          WHERE ${seoScans.id} = ${seoIssues.scanId}
            AND ${seoScans.rawData}->>'kind' = 'post_scan'
        )`,
      ),
    )
    .returning({ id: seoIssues.id });
  return deleted.length;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const batchSize = clampInt(
    url.searchParams.get("limit") ?? process.env.SEO_SCAN_BATCH_SIZE ?? "25",
    1,
    200,
    25,
  );
  const concurrency = clampInt(
    url.searchParams.get("concurrency") ??
      process.env.SEO_SCAN_CONCURRENCY ??
      "5",
    1,
    10,
    5,
  );
  const purge = url.searchParams.get("purge") === "1";
  const reset = url.searchParams.get("reset") === "1";

  try {
    // Clean slate wins over the softer purge if both are passed.
    let resetCounts: { issues: number; scans: number } | undefined;
    if (reset) {
      resetCounts = await resetAllSeoData();
      console.info(
        `[seo-scan] RESET — wiped ${resetCounts.issues} issue(s) and ${resetCounts.scans} scan(s)`,
      );
    }

    let purged: number | undefined;
    if (purge && !reset) {
      purged = await purgeCrawlerIssues();
      console.info(`[seo-scan] purged ${purged} legacy crawler issue(s)`);
    }

    // Published posts that have a public URL but have NEVER been per-post
    // scanned (no seo_scans row with rawData.postId == this post). Newest
    // first so recent content is covered before the long backfill tail.
    const candidates = await db
      .select({ id: generatedPosts.id })
      .from(generatedPosts)
      .where(
        and(
          eq(generatedPosts.status, "published"),
          isNotNull(generatedPosts.externalPostUrl),
          sql`NOT EXISTS (
            SELECT 1 FROM ${seoScans}
            WHERE ${seoScans.rawData}->>'kind' = 'post_scan'
              AND ${seoScans.rawData}->>'postId' = ${generatedPosts.id}::text
          )`,
        ),
      )
      .orderBy(desc(generatedPosts.publishedAt))
      .limit(batchSize);

    if (candidates.length === 0) {
      return NextResponse.json({
        message:
          "No unscanned published posts — every published post has a per-post scan.",
        batchSize,
        concurrency,
        ...(reset ? { reset: resetCounts } : {}),
        ...(purge && !reset ? { purgedCrawlerIssues: purged } : {}),
      });
    }

    const startedAt = Date.now();
    const outcomes = await runInParallel(
      candidates,
      concurrency,
      async (c): Promise<PostOutcome> => {
        try {
          const r = await runPostSeoScan(c.id);
          return {
            postId: c.id,
            status: r.success ? "scanned" : "skipped",
            score: r.score,
            issues: r.issues,
            message: r.success ? undefined : r.message,
          };
        } catch (err) {
          return {
            postId: c.id,
            status: "failed",
            message: err instanceof Error ? err.message : "Unknown scan error",
          };
        }
      },
    );
    const totalDurationMs = Date.now() - startedAt;

    const scanned = outcomes.filter((o) => o.status === "scanned").length;
    const skipped = outcomes.filter((o) => o.status === "skipped").length;
    const failed = outcomes.filter((o) => o.status === "failed").length;

    console.info(
      `[seo-scan] per-post batch complete in ${totalDurationMs}ms — ` +
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
      ...(reset ? { reset: resetCounts } : {}),
      ...(purge && !reset ? { purgedCrawlerIssues: purged } : {}),
      results: outcomes,
    });
  } catch (error) {
    console.error("SEO scan cron error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown scan error";
    return NextResponse.json(
      { error: "Scan batch failed", message },
      { status: 500 },
    );
  }
}
