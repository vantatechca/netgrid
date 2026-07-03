import { db } from "@/lib/db";
import { clients, blogs, linkEvents, generatedPosts } from "@/lib/db/schema";
import { and, avg, count, desc, eq, gte, ilike, max } from "drizzle-orm";

/**
 * Read models for the public marketing API. These deliberately expose ONLY
 * safe, client-facing fields — never platform credentials (WP passwords,
 * Shopify tokens/secrets), internal notes, or custom prompts. Add fields here
 * explicitly; do not spread whole rows.
 */

type ClientStatus = "onboarding" | "active" | "paused" | "churned";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface Traffic {
  views: number;
  clicks: number;
}

// ─── Aggregations (all fail-safe: an un-migrated link_events table → zeros) ──

/** Views + CTA clicks grouped by clientId, across all clients. */
async function trafficByClient(): Promise<Map<string, Traffic>> {
  const map = new Map<string, Traffic>();
  try {
    const rows = await db
      .select({
        clientId: linkEvents.clientId,
        type: linkEvents.type,
        c: count(),
      })
      .from(linkEvents)
      .groupBy(linkEvents.clientId, linkEvents.type);
    for (const r of rows) {
      if (!r.clientId) continue;
      const t = map.get(r.clientId) ?? { views: 0, clicks: 0 };
      if (r.type === "view") t.views = Number(r.c);
      else if (r.type === "cta_click") t.clicks = Number(r.c);
      map.set(r.clientId, t);
    }
  } catch {
    /* table missing / transient — leave empty */
  }
  return map;
}

/** Views + CTA clicks grouped by blogId, for one client. */
async function trafficByBlog(clientId: string): Promise<Map<string, Traffic>> {
  const map = new Map<string, Traffic>();
  try {
    const rows = await db
      .select({
        blogId: linkEvents.blogId,
        type: linkEvents.type,
        c: count(),
      })
      .from(linkEvents)
      .where(eq(linkEvents.clientId, clientId))
      .groupBy(linkEvents.blogId, linkEvents.type);
    for (const r of rows) {
      if (!r.blogId) continue;
      const t = map.get(r.blogId) ?? { views: 0, clicks: 0 };
      if (r.type === "view") t.views = Number(r.c);
      else if (r.type === "cta_click") t.clicks = Number(r.c);
      map.set(r.blogId, t);
    }
  } catch {
    /* leave empty */
  }
  return map;
}

/** Published-post count grouped by clientId. */
async function publishedByClient(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const rows = await db
      .select({ clientId: generatedPosts.clientId, c: count() })
      .from(generatedPosts)
      .where(eq(generatedPosts.status, "published"))
      .groupBy(generatedPosts.clientId);
    for (const r of rows) {
      if (r.clientId) map.set(r.clientId, Number(r.c));
    }
  } catch {
    /* leave empty */
  }
  return map;
}

/** Published-post count grouped by blogId, for one client. */
async function publishedByBlog(clientId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const rows = await db
      .select({ blogId: generatedPosts.blogId, c: count() })
      .from(generatedPosts)
      .where(
        and(
          eq(generatedPosts.clientId, clientId),
          eq(generatedPosts.status, "published"),
        ),
      )
      .groupBy(generatedPosts.blogId);
    for (const r of rows) {
      if (r.blogId) map.set(r.blogId, Number(r.c));
    }
  } catch {
    /* leave empty */
  }
  return map;
}

/** Count of posts published in the last 30 days for one client. */
async function publishedLast30(clientId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ c: count() })
      .from(generatedPosts)
      .where(
        and(
          eq(generatedPosts.clientId, clientId),
          eq(generatedPosts.status, "published"),
          gte(generatedPosts.publishedAt, since),
        ),
      );
    return Number(row?.c ?? 0);
  } catch {
    return 0;
  }
}

// ─── Public shapes ───────────────────────────────────────────────────────────

export interface PublicClientSummary {
  id: string;
  name: string;
  niche: string | null;
  status: string | null;
  blogCount: number;
  avgSeoScore: number | null;
  lastPostAt: string | null;
  /** Published posts across the client's sites. */
  postCount: number;
  /** Tracked page views across the client's sites. */
  views: number;
  /** Tracked CTA clicks across the client's sites. */
  clicks: number;
}

export interface PublicSite {
  id: string;
  domain: string;
  platform: string | null;
  status: string | null;
  seoScore: number | null;
  lastPostAt: string | null;
  lastPostTitle: string | null;
  lastScanAt: string | null;
  postCount: number;
  views: number;
  clicks: number;
}

export interface PublicClientDetail extends PublicClientSummary {
  contactEmail: string | null;
  activeBlogCount: number;
  /** Posts published in the last 30 days. */
  postsLast30Days: number;
  sites: PublicSite[];
}

/**
 * List clients with rolled-up site count, average SEO score, last-post
 * timestamp, published-post count, and tracked views/clicks. Optional
 * case-insensitive email match and status filter.
 */
export async function listPublicClients(opts?: {
  email?: string;
  status?: string;
}): Promise<PublicClientSummary[]> {
  const conds = [];
  if (opts?.email) conds.push(ilike(clients.contactEmail, opts.email));
  if (opts?.status) conds.push(eq(clients.status, opts.status as ClientStatus));

  const [rows, traffic, posts] = await Promise.all([
    db
      .select({
        id: clients.id,
        name: clients.name,
        niche: clients.niche,
        status: clients.status,
        blogCount: count(blogs.id),
        avgSeoScore: avg(blogs.currentSeoScore),
        lastPostAt: max(blogs.lastPostVerifiedAt),
      })
      .from(clients)
      .leftJoin(blogs, eq(blogs.clientId, clients.id))
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(clients.id)
      .orderBy(desc(clients.createdAt)),
    trafficByClient(),
    publishedByClient(),
  ]);

  return rows.map((r) => {
    const t = traffic.get(r.id) ?? { views: 0, clicks: 0 };
    return {
      id: r.id,
      name: r.name,
      niche: r.niche,
      status: r.status,
      blogCount: Number(r.blogCount ?? 0),
      avgSeoScore:
        r.avgSeoScore != null ? Math.round(Number(r.avgSeoScore)) : null,
      lastPostAt: iso(r.lastPostAt),
      postCount: posts.get(r.id) ?? 0,
      views: t.views,
      clicks: t.clicks,
    };
  });
}

/**
 * A single client with its sites (blogs), per-site SEO scores, published-post
 * counts, and tracked views/clicks. Returns null when the id doesn't exist.
 */
export async function getPublicClient(
  clientId: string,
): Promise<PublicClientDetail | null> {
  const [c] = await db
    .select({
      id: clients.id,
      name: clients.name,
      niche: clients.niche,
      status: clients.status,
      contactEmail: clients.contactEmail,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!c) return null;

  const [siteRows, blogTraffic, blogPosts, postsLast30Days] = await Promise.all([
    db
      .select({
        id: blogs.id,
        domain: blogs.domain,
        platform: blogs.platform,
        status: blogs.status,
        seoScore: blogs.currentSeoScore,
        lastPostAt: blogs.lastPostVerifiedAt,
        lastPostTitle: blogs.lastPostTitle,
        lastScanAt: blogs.lastSeoScanAt,
      })
      .from(blogs)
      .where(eq(blogs.clientId, clientId))
      .orderBy(desc(blogs.currentSeoScore)),
    trafficByBlog(clientId),
    publishedByBlog(clientId),
    publishedLast30(clientId),
  ]);

  const sites: PublicSite[] = siteRows.map((s) => {
    const t = blogTraffic.get(s.id) ?? { views: 0, clicks: 0 };
    return {
      id: s.id,
      domain: s.domain,
      platform: s.platform,
      status: s.status,
      seoScore: s.seoScore ?? null,
      lastPostAt: iso(s.lastPostAt),
      lastPostTitle: s.lastPostTitle,
      lastScanAt: iso(s.lastScanAt),
      postCount: blogPosts.get(s.id) ?? 0,
      views: t.views,
      clicks: t.clicks,
    };
  });

  const scored = sites.filter((s) => s.seoScore != null);
  const avgSeoScore = scored.length
    ? Math.round(
        scored.reduce((sum, s) => sum + (s.seoScore as number), 0) /
          scored.length,
      )
    : null;
  const lastPostAt =
    sites
      .map((s) => s.lastPostAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

  const views = sites.reduce((sum, s) => sum + s.views, 0);
  const clicks = sites.reduce((sum, s) => sum + s.clicks, 0);
  const postCount = sites.reduce((sum, s) => sum + s.postCount, 0);

  return {
    id: c.id,
    name: c.name,
    niche: c.niche,
    status: c.status,
    contactEmail: c.contactEmail,
    blogCount: sites.length,
    activeBlogCount: sites.filter((s) => s.status === "active").length,
    avgSeoScore,
    lastPostAt,
    postCount,
    postsLast30Days,
    views,
    clicks,
    sites,
  };
}
