import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";
import { clientSeoHistory, isUuid, parseSince } from "@/lib/api/public-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients/{clientId}/seo-history
 * Per-site overall-SEO-score time series (oldest first) for trend charts.
 * Query params (optional):
 *   ?blogId=<uuid>   restrict to one site
 *   ?days=<1..365>   window (default all-time)
 *   ?since=<ISO>     window lower bound (ignored if ?days is set)
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
  const since = parseSince(url.searchParams);

  try {
    const history = await clientSeoHistory(clientId, { blogId, since });
    return NextResponse.json(history);
  } catch (err) {
    console.error("[api/v1/clients/:id/seo-history] failed:", err);
    return NextResponse.json(
      { error: "Failed to load SEO history" },
      { status: 500 },
    );
  }
}
