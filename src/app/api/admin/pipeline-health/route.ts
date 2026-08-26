import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Pipeline health for the admin dashboard (T22).
 *
 * Returns, for the last 24h: per-job run summary, the auto-publish quality
 * ratios, and the top error codes with their distinct-blog counts. The
 * distinct-blog count is what separates "one broken site" from
 * "platform-wide" — surface it, do not aggregate it away.
 *
 * GET /api/admin/pipeline-health
 */

/** neon-http returns { rows: [...] }, not an array. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] } | null;
  return r?.rows ?? [];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobsRes = await db.execute(sql`
    SELECT
      job,
      count(*) AS runs,
      count(*) FILTER (WHERE NOT ok) AS failed_runs,
      coalesce(sum((counters->>'published')::int), 0) AS published,
      coalesce(sum((counters->>'failed')::int), 0) AS failed,
      coalesce(sum(error_count), 0) AS errors,
      max(started_at) AS last_run,
      round(avg(duration_ms) / 1000.0, 1) AS avg_secs
    FROM cron_runs
    WHERE started_at > now() - interval '24 hours'
    GROUP BY job
    ORDER BY job
  `);

  const ratiosRes = await db.execute(sql`
    SELECT
      coalesce(sum((counters->>'published')::int), 0) AS published,
      coalesce(sum((counters->>'truncatedSalvaged')::int), 0) AS truncated_salvaged,
      coalesce(sum((counters->>'imageless')::int), 0) AS imageless,
      coalesce(sum((counters->>'metaWriteUnverified')::int), 0) AS meta_write_unverified,
      coalesce(sum((counters->>'indexNowRejected')::int), 0) AS index_now_rejected,
      coalesce(sum((counters->>'blockedRegenerate')::int), 0) AS blocked_regenerate,
      coalesce(sum((counters->>'linkingSkipped')::int), 0) AS linking_skipped,
      coalesce(sum((counters->'providerUsed'->>'deepseek')::int), 0) AS deepseek_calls,
      coalesce(sum((counters->'providerUsed'->>'claude')::int), 0) AS claude_calls
    FROM cron_runs
    WHERE job = 'auto-publish'
      AND started_at > now() - interval '24 hours'
  `);

  const errorsRes = await db.execute(sql`
    SELECT code, severity,
           count(*) AS n,
           count(DISTINCT blog_id) AS blogs,
           max(created_at) AS last_seen,
           (array_agg(message ORDER BY created_at DESC))[1] AS latest_message
    FROM pipeline_errors
    WHERE created_at > now() - interval '24 hours'
    GROUP BY code, severity
    ORDER BY n DESC
    LIMIT 25
  `);

  const alertsRes = await db.execute(sql`
    SELECT alert_key, severity, subject, delivered, delivery_error, created_at
    FROM alert_log
    WHERE created_at > now() - interval '7 days'
    ORDER BY created_at DESC
    LIMIT 25
  `);

  const ratios = rowsOf<Record<string, string>>(ratiosRes)[0] ?? {};
  const published = Number(ratios.published ?? 0);
  const ratio = (k: string) =>
    published > 0 ? Number(ratios[k] ?? 0) / published : 0;

  return NextResponse.json({
    windowHours: 24,
    jobs: rowsOf(jobsRes),
    quality: {
      published,
      truncatedSalvagedPct: ratio("truncated_salvaged"),
      imagelessPct: ratio("imageless"),
      metaWriteUnverifiedPct: ratio("meta_write_unverified"),
      indexNowRejectedPct: ratio("index_now_rejected"),
      blockedRegeneratePct: ratio("blocked_regenerate"),
      linkingSkippedPct: ratio("linking_skipped"),
      // Inverse of metaWriteUnverifiedPct — the "verification coverage"
      // number the alert threshold is stated against.
      metaVerificationCoverage: 1 - ratio("meta_write_unverified"),
      deepseekCalls: Number(ratios.deepseek_calls ?? 0),
      claudeCalls: Number(ratios.claude_calls ?? 0),
    },
    topErrors: rowsOf(errorsRes),
    recentAlerts: rowsOf(alertsRes),
  });
}
