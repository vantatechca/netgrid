import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runAutoPublishCron } from "@/lib/actions/content-generation-actions";

// Generation + analysis + publish takes ~25-35s per blog. At
// MAX_BLOGS_PER_CRON_RUN=50 a worst-case single shard run could need
// ~25 minutes if all 50 ran sequentially, but the per-run cap is
// designed so the work always fits inside the function deadline.
// 600s gives ~16-20 blogs of actual finished work per run; the rest
// are deferred to the next hourly tick.
export const maxDuration = 600;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sharding via query string. Cron services and the web service are
  // separate Render services with separate env var sets — env vars set
  // on a cron service do NOT reach the web handler. So each cron
  // service encodes its shard in CRON_PATH:
  //   /api/cron/auto-publish?shard=0&shardCount=4
  // The runner reads the params here and forwards them down.
  const url = new URL(request.url);
  const shardParam = url.searchParams.get("shard");
  const shardCountParam = url.searchParams.get("shardCount");

  try {
    const result = await runAutoPublishCron({
      shardIndex: shardParam !== null ? Number(shardParam) : undefined,
      shardCount: shardCountParam !== null ? Number(shardCountParam) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    // runWithTelemetry already persisted a cron_runs row with ok=false and
    // a CRON_RUN_FATAL pipeline_errors row before re-throwing, so this is
    // purely the HTTP surface. Keep the console line for the live tail.
    console.error("[auto-publish] cron error:", error);
    const message = error instanceof Error ? error.message : "Auto-publish failed";
    return NextResponse.json(
      { error: message, job: "auto-publish" },
      { status: 500 },
    );
  }
}
