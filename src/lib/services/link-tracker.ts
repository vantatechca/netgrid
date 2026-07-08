import "server-only";
import { db } from "@/lib/db";
import { linkEvents, generatedPosts, clients, blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { effectiveCtaDestination } from "@/lib/content/cta-target";

/**
 * Netgrid-hosted link tracking for published posts. CTA buttons point at
 * /r/{postId} (logs a click, then 302s to the client's real CTA URL); each post
 * body carries a 1x1 pixel at /api/track/px/{postId} (logs a page view). Both
 * need netgrid's PUBLIC origin, since the markup renders on external Shopify/WP
 * sites — set NEXT_PUBLIC_APP_URL to the production host.
 */

export function getAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL || "https://netgrid-16f6.onrender.com";
  return raw.replace(/\/+$/, "");
}

export function ctaRedirectUrl(postId: string): string {
  return `${getAppBaseUrl()}/r/${postId}`;
}

export function trackingPixelUrl(postId: string): string {
  return `${getAppBaseUrl()}/api/track/px/${postId}`;
}

/** Hidden tracking-pixel <img> appended to a published post body. */
export function trackingPixelImg(postId: string): string {
  return (
    `<img src="${trackingPixelUrl(postId)}" width="1" height="1" ` +
    `alt="" aria-hidden="true" style="position:absolute;width:1px;height:1px;` +
    `opacity:0;pointer-events:none;" />`
  );
}

/**
 * Blog-level (site-wide) page-view pixel. Logs a view keyed to the blog with no
 * postId — used for the homepage and other non-article pages, where there is no
 * per-post body pixel. Injected into the Shopify theme <head> (see
 * shopify-theme-client) so it fires on every page load of the store.
 */
export function blogTrackingPixelUrl(blogId: string): string {
  return `${getAppBaseUrl()}/api/track/px/blog/${blogId}`;
}

/**
 * Hidden blog-level tracking-pixel <img>. Used when embedding into page BODY
 * content (e.g. a WordPress static homepage), where an <img> renders — unlike
 * the Shopify <head> beacon, which is script-based.
 */
export function blogTrackingPixelImg(blogId: string): string {
  return (
    `<img src="${blogTrackingPixelUrl(blogId)}" width="1" height="1" ` +
    `alt="" aria-hidden="true" style="position:absolute;width:1px;height:1px;` +
    `opacity:0;pointer-events:none;" />`
  );
}

/**
 * Blog-level tracked CTA redirect. Logs a cta_click (no postId) and 302s to the
 * client's CTA URL — the site-wide analogue of /r/{postId}. Used for CTA links
 * on non-post pages (e.g. the homepage) that point at the client's CTA.
 */
export function blogCtaRedirectUrl(blogId: string): string {
  return `${getAppBaseUrl()}/r/blog/${blogId}`;
}

export type LinkEventType = "view" | "cta_click";

/** Best-effort append to the traffic log — never throws to the caller. */
export async function logLinkEvent(input: {
  postId?: string | null;
  blogId?: string | null;
  clientId?: string | null;
  type: LinkEventType;
  referrer?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.insert(linkEvents).values({
      postId: input.postId ?? null,
      blogId: input.blogId ?? null,
      clientId: input.clientId ?? null,
      type: input.type,
      referrer: input.referrer?.slice(0, 2000) ?? null,
      userAgent: input.userAgent?.slice(0, 1000) ?? null,
    });
  } catch (err) {
    console.warn(
      "[link-tracker] log failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export interface PostRedirectContext {
  postId: string;
  blogId: string | null;
  clientId: string | null;
  ctaUrl: string | null;
}

/** Resolve a blog → its client, for attributing a site-wide (postId-less) view. */
export async function resolveBlogClient(
  blogId: string,
): Promise<{ blogId: string; clientId: string } | null> {
  try {
    const [row] = await db
      .select({ blogId: blogs.id, clientId: blogs.clientId })
      .from(blogs)
      .where(eq(blogs.id, blogId))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.warn(
      "[link-tracker] resolve blog failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Resolve a blog → its client + the CTA destination, for a site-wide redirect.
 * Peptides blogs resolve to their own domain (per blog); all other niches use
 * the client's manually-entered CTA URL. See effectiveCtaDestination.
 */
export async function resolveBlogRedirect(
  blogId: string,
): Promise<{ blogId: string; clientId: string; ctaUrl: string | null } | null> {
  try {
    const [row] = await db
      .select({
        blogId: blogs.id,
        clientId: blogs.clientId,
        domain: blogs.domain,
        niche: clients.niche,
        ctaUrl: clients.ctaUrl,
      })
      .from(blogs)
      .leftJoin(clients, eq(blogs.clientId, clients.id))
      .where(eq(blogs.id, blogId))
      .limit(1);
    if (!row) return null;
    return {
      blogId: row.blogId,
      clientId: row.clientId,
      ctaUrl: effectiveCtaDestination({
        niche: row.niche,
        blogDomain: row.domain,
        ctaUrl: row.ctaUrl,
      }),
    };
  } catch (err) {
    console.warn(
      "[link-tracker] resolve blog redirect failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Resolve a generated post → its blog/client + the CTA destination. Peptides
 * posts resolve to their blog's own domain (per blog); all other niches use the
 * client's manually-entered CTA URL. See effectiveCtaDestination.
 */
export async function resolvePostRedirect(
  postId: string,
): Promise<PostRedirectContext | null> {
  try {
    const [row] = await db
      .select({
        postId: generatedPosts.id,
        blogId: generatedPosts.blogId,
        clientId: generatedPosts.clientId,
        domain: blogs.domain,
        niche: clients.niche,
        ctaUrl: clients.ctaUrl,
      })
      .from(generatedPosts)
      .leftJoin(clients, eq(generatedPosts.clientId, clients.id))
      .leftJoin(blogs, eq(generatedPosts.blogId, blogs.id))
      .where(eq(generatedPosts.id, postId))
      .limit(1);
    if (!row) return null;
    return {
      postId: row.postId,
      blogId: row.blogId,
      clientId: row.clientId,
      ctaUrl: effectiveCtaDestination({
        niche: row.niche,
        blogDomain: row.domain,
        ctaUrl: row.ctaUrl,
      }),
    };
  } catch (err) {
    console.warn(
      "[link-tracker] resolve failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
