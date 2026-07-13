import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { refreshAllClientKeywordsInternal } from "@/lib/actions/keyword-actions";

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
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Refresh-keywords cron error:", error);
    const message =
      error instanceof Error ? error.message : "Refresh-keywords cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
