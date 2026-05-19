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

  try {
    const result = await runAutoPublishCron();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Auto-publish cron error:", error);
    const message = error instanceof Error ? error.message : "Auto-publish failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
