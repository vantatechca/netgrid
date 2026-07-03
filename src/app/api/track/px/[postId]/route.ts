import { NextResponse } from "next/server";
import { resolvePostRedirect, logLinkEvent } from "@/lib/services/link-tracker";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * GET /api/track/px/{postId} — page-view tracking pixel. Logs a "view" and
 * returns a 1x1 GIF (never cached). Always returns the pixel, even for an
 * unknown post, so the image never appears broken.
 */
export async function GET(
  request: Request,
  { params }: { params: { postId: string } },
) {
  const { postId } = params;
  if (UUID_RE.test(postId)) {
    const ctx = await resolvePostRedirect(postId);
    await logLinkEvent({
      postId,
      blogId: ctx?.blogId,
      clientId: ctx?.clientId,
      type: "view",
      referrer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
    });
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
