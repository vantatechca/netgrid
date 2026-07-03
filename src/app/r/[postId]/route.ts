import { NextResponse } from "next/server";
import { resolvePostRedirect, logLinkEvent } from "@/lib/services/link-tracker";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /r/{postId} — tracked CTA redirect. Logs a "cta_click" and 302s to the
 * post's client CTA URL. Falls back to the site root when the post/CTA is
 * missing or the destination isn't a safe http(s) URL.
 */
export async function GET(
  request: Request,
  { params }: { params: { postId: string } },
) {
  const { postId } = params;
  const home = new URL("/", request.url);

  if (!UUID_RE.test(postId)) {
    return NextResponse.redirect(home, 302);
  }

  const ctx = await resolvePostRedirect(postId);
  await logLinkEvent({
    postId,
    blogId: ctx?.blogId,
    clientId: ctx?.clientId,
    type: "cta_click",
    referrer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
  });

  const dest = ctx?.ctaUrl?.trim();
  if (dest && /^https?:\/\//i.test(dest)) {
    return NextResponse.redirect(dest, 302);
  }
  return NextResponse.redirect(home, 302);
}
