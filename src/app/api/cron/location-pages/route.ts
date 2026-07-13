import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runLocationDripInternal } from "@/lib/actions/location-actions";

// Location-page drip generates full articles (Claude + image + scrubber +
// platform publish) for pending peptide location targets — allow the same
// generous timeout the auto-publish path uses.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runLocationDripInternal();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Location-pages cron error:", error);
    const message =
      error instanceof Error ? error.message : "Location-pages cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
