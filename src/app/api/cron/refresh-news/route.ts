import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import {
  refreshAllNewsInternal,
  prunOldNewsInternal,
} from "@/lib/actions/news-actions";

// News refresh fans out across verticals × queries. Each query hits a
// remote URL (Google News RSS, optionally NewsAPI/GNews). Allow a
// generous timeout so the job completes even when a few queries are
// slow.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await refreshAllNewsInternal();
    const pruned = await prunOldNewsInternal(30);

    const summary = {
      verticalsProcessed: results.length,
      totalFetched: results.reduce((s, r) => s + r.fetched, 0),
      totalInserted: results.reduce((s, r) => s + r.inserted, 0),
      pruned,
      results,
    };
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Refresh-news cron error:", error);
    const message =
      error instanceof Error ? error.message : "Refresh-news cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
