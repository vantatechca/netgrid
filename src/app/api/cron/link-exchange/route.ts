import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runLinkExchange } from "@/lib/services/link-exchange";

// Placement fetches + re-pushes live post bodies across platforms; give it room.
export const maxDuration = 600;

/**
 * Link-exchange cron. Builds new ABC loops from opt-in same-niche blogs, then
 * drips a capped number of body-text exchange links into existing posts (≤1
 * per source blog per run). Deliberately low-volume to match natural pace.
 *
 * GET /api/cron/link-exchange?limit=10
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam !== null ? Number(limitParam) : undefined;

  try {
    const result = await runLinkExchange({
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Link-exchange cron error:", error);
    const message =
      error instanceof Error ? error.message : "Link exchange failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
