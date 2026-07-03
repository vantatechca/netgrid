import { db } from "@/lib/db";
import { clients, blogs } from "@/lib/db/schema";
import { and, avg, count, desc, eq, ilike, max } from "drizzle-orm";

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

export interface PublicClientSummary {
  id: string;
  name: string;
  niche: string | null;
  status: string | null;
  blogCount: number;
  avgSeoScore: number | null;
  lastPostAt: string | null;
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
}

export interface PublicClientDetail extends PublicClientSummary {
  contactEmail: string | null;
  activeBlogCount: number;
  sites: PublicSite[];
}

/**
 * List clients with rolled-up site count, average SEO score, and last-post
 * timestamp. Optional case-insensitive email match (for the marketing app to
 * resolve a logged-in user to their client) and status filter.
 */
export async function listPublicClients(opts?: {
  email?: string;
  status?: string;
}): Promise<PublicClientSummary[]> {
  const conds = [];
  if (opts?.email) conds.push(ilike(clients.contactEmail, opts.email));
  if (opts?.status) conds.push(eq(clients.status, opts.status as ClientStatus));

  const rows = await db
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
    .orderBy(desc(clients.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    niche: r.niche,
    status: r.status,
    blogCount: Number(r.blogCount ?? 0),
    avgSeoScore: r.avgSeoScore != null ? Math.round(Number(r.avgSeoScore)) : null,
    lastPostAt: iso(r.lastPostAt),
  }));
}

/**
 * A single client with its sites (blogs) and per-site SEO scores. Returns null
 * when the id doesn't exist.
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

  const siteRows = await db
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
    .orderBy(desc(blogs.currentSeoScore));

  const sites: PublicSite[] = siteRows.map((s) => ({
    id: s.id,
    domain: s.domain,
    platform: s.platform,
    status: s.status,
    seoScore: s.seoScore ?? null,
    lastPostAt: iso(s.lastPostAt),
    lastPostTitle: s.lastPostTitle,
    lastScanAt: iso(s.lastScanAt),
  }));

  const scored = sites.filter((s) => s.seoScore != null);
  const avgSeoScore = scored.length
    ? Math.round(
        scored.reduce((sum, s) => sum + (s.seoScore as number), 0) /
          scored.length,
      )
    : null;
  const lastPostAt = sites
    .map((s) => s.lastPostAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? null;

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
    sites,
  };
}
