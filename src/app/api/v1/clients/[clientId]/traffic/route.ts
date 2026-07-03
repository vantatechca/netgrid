import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";
import {
  clientTrafficSeries,
  isUuid,
  parseSince,
  type TrafficGranularity,
} from "@/lib/api/public-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients/{clientId}/traffic
 * Views/clicks bucketed over time for a client (only buckets with activity).
 * Query params (optional):
 *   ?granularity=day|week   bucket size (default day)
 *   ?blogId=<uuid>          restrict to one site
 *   ?days=<1..365>          window (default all-time)
 *   ?since=<ISO>            window lower bound (ignored if ?days is set)
 */
export async function GET(
  request: Request,
  { params }: { params: { clientId: string } },
) {
  const denied = await apiAuthGuard(request);
  if (denied) return denied;

  const { clientId } = params;
  if (!isUuid(clientId)) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const blogId = url.searchParams.get("blogId")?.trim() || undefined;
  if (blogId && !isUuid(blogId)) {
    return NextResponse.json({ error: "Invalid blogId" }, { status: 400 });
  }
  const granularity: TrafficGranularity =
    url.searchParams.get("granularity") === "week" ? "week" : "day";
  const since = parseSince(url.searchParams);

  try {
    const series = await clientTrafficSeries(clientId, {
      granularity,
      blogId,
      since,
    });
    return NextResponse.json({ clientId, granularity, series });
  } catch (err) {
    console.error("[api/v1/clients/:id/traffic] failed:", err);
    return NextResponse.json(
      { error: "Failed to load traffic" },
      { status: 500 },
    );
  }
}
