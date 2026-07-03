import { NextResponse } from "next/server";
import { resolveBlogRedirect, logLinkEvent } from "@/lib/services/link-tracker";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /r/blog/{blogId} — site-wide tracked CTA redirect. Logs a "cta_click"
 * (no postId) and 302s to the blog's client CTA URL. Used for CTA links on
 * non-post pages such as the homepage. Falls back to the site root when the
 * blog/CTA is missing or the destination isn't a safe http(s) URL.
 */
export async function GET(
  request: Request,
  { params }: { params: { blogId: string } },
) {
  const { blogId } = params;
  const home = new URL("/", request.url);

  if (!UUID_RE.test(blogId)) {
    return NextResponse.redirect(home, 302);
  }

  const ctx = await resolveBlogRedirect(blogId);
  await logLinkEvent({
    postId: null,
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
