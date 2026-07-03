import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";
import { getNetworkSummary } from "@/lib/api/public-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/summary
 * Network-wide totals for an overview widget: client/site/post counts, total
 * views/clicks, and average SEO score across all sites.
 */
export async function GET(request: Request) {
  const denied = await apiAuthGuard(request);
  if (denied) return denied;

  try {
    const summary = await getNetworkSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[api/v1/summary] failed:", err);
    return NextResponse.json(
      { error: "Failed to load summary" },
      { status: 500 },
    );
  }
}
