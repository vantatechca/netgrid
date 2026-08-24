import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { refreshAllClientKeywordsInternal } from "@/lib/actions/keyword-actions";
import { rebuildAllKeywordTargetsInternal } from "@/lib/actions/keyword-target-actions";

// Keyword refresh re-scrapes every seeded client via Google Autocomplete
// (many small suggest requests per client). Allow a generous timeout so the
// job completes even with a lot of clients.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await refreshAllClientKeywordsInternal();

    // Local keyword-targeted content (see docs/local-keyword-content-plan.md):
    // refresh every active, city-bearing blog's keyword-target ledger right
    // after the scrape, so newly-discovered keywords become new targets
    // automatically. Kept in its own try/catch — a target-rebuild failure
    // must not mask the scrape summary above, which already succeeded.
    let targets: Awaited<ReturnType<typeof rebuildAllKeywordTargetsInternal>> | null = null;
    let targetsError: string | null = null;
    try {
      targets = await rebuildAllKeywordTargetsInternal();
    } catch (error) {
      console.error("Refresh-keywords cron — target rebuild error:", error);
      targetsError = error instanceof Error ? error.message : "Target rebuild failed";
    }

    return NextResponse.json({ ...summary, targets, targetsError });
  } catch (error) {
    console.error("Refresh-keywords cron error:", error);
    const message =
      error instanceof Error ? error.message : "Refresh-keywords cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
