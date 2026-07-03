import { NextResponse } from "next/server";
import { apiAuthGuard } from "@/lib/api/auth";
import { isUuid, listClientPosts } from "@/lib/api/public-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/clients/{clientId}/posts
 * Published posts for a client, newest first, with live URL and per-post
 * views/clicks.
 * Query params (optional):
 *   ?blogId=<uuid>   restrict to one site
 *   ?limit=<1..100>  page size (default 20)
 *   ?offset=<n>      pagination offset (default 0)
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
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "", 10);

  try {
    const page = await listClientPosts(clientId, {
      blogId,
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });
    return NextResponse.json(page);
  } catch (err) {
    console.error("[api/v1/clients/:id/posts] failed:", err);
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }
}
