import { NextResponse } from "next/server";
import { resolveBlogClient, logLinkEvent } from "@/lib/services/link-tracker";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * GET /api/track/px/blog/{blogId} — site-wide page-view pixel. Logs a "view"
 * attributed to the blog (no postId) and returns a 1x1 GIF (never cached).
 * Injected into the Shopify theme <head> so it fires on the homepage and any
 * other non-article page. Article pages use the per-post pixel instead
 * (/api/track/px/{postId}), so the two never double-count.
 */
export async function GET(
  request: Request,
  { params }: { params: { blogId: string } },
) {
  const { blogId } = params;
  if (UUID_RE.test(blogId)) {
    const ctx = await resolveBlogClient(blogId);
    if (ctx) {
      await logLinkEvent({
        postId: null,
        blogId: ctx.blogId,
        clientId: ctx.clientId,
        type: "view",
        referrer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
      });
    }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
