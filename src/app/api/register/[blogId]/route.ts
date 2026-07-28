import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogs, clients, registrationLeads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/register/{blogId} — the mini registration form target. Records the
 * lead (name / location / email) tied to the blog + client, then 302-redirects
 * the visitor to the client's own registration page
 * (clients.registrationRedirectUrl). Falls back to the site root when that URL
 * is missing or unsafe. A filled honeypot field ("website") is silently
 * dropped. Never throws to the visitor — capture is best-effort.
 */
export async function POST(
  request: Request,
  { params }: { params: { blogId: string } },
) {
  const { blogId } = params;
  const home = new URL("/", request.url);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.redirect(home, 303);
  }

  // Honeypot — bots fill hidden fields. Redirect as if fine, but store nothing.
  const honeypot = String(form.get("website") ?? "").trim();

  if (!UUID_RE.test(blogId)) {
    return NextResponse.redirect(home, 303);
  }

  const [ctx] = await db
    .select({
      clientId: blogs.clientId,
      enabled: clients.registrationFormEnabled,
      redirectUrl: clients.registrationRedirectUrl,
    })
    .from(blogs)
    .leftJoin(clients, eq(blogs.clientId, clients.id))
    .where(eq(blogs.id, blogId))
    .limit(1);

  const dest =
    ctx?.redirectUrl && /^https?:\/\//i.test(ctx.redirectUrl.trim())
      ? ctx.redirectUrl.trim()
      : null;

  // Record the lead (best-effort) unless it's a honeypot hit or the form is off.
  if (!honeypot && ctx?.clientId && ctx.enabled) {
    const name = String(form.get("name") ?? "").trim().slice(0, 255);
    const location = String(form.get("location") ?? "").trim().slice(0, 255);
    const email = String(form.get("email") ?? "").trim().slice(0, 320);
    const postIdRaw = String(form.get("postId") ?? "").trim();
    const postId = UUID_RE.test(postIdRaw) ? postIdRaw : null;

    if (name || email) {
      try {
        await db.insert(registrationLeads).values({
          clientId: ctx.clientId,
          blogId,
          postId,
          name: name || null,
          location: location || null,
          email: email || null,
          referrer: request.headers.get("referer")?.slice(0, 2000) ?? null,
          userAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
        });
      } catch (err) {
        console.warn(
          "[register] lead insert failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  // 303 so the browser switches POST → GET on the redirect.
  return NextResponse.redirect(dest ? new URL(dest) : home, 303);
}
