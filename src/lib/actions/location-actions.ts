"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityLog,
  blogs,
  clients,
  peptideLocationTargets,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { isPeptidesNiche } from "@/lib/content/cta-target";
import {
  buildLocationTitle,
  buildLocationKeywords,
  parseLocations,
} from "@/lib/content/location-targeting";
import {
  getStyleProfileForBlog,
  assignProfileForBlogIfPeptides,
} from "@/lib/actions/style-profile-actions";
import { runGenerateAndPublish } from "@/lib/actions/content-generation-actions";

export type LocationTarget = typeof peptideLocationTargets.$inferSelect;

/** Soft cap on how many location pages a single drip cron run will publish. */
const MAX_DRIP_PER_RUN = 30;

// ─── config ───────────────────────────────────────────────────────────────────

/** Save a client's target locations (used the next time the matrix is built). */
export async function updateClientLocations(
  clientId: string,
  locations: string,
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();
  const clean = locations.trim();
  await db
    .update(clients)
    .set({ peptideLocations: clean || null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  revalidatePath(`/clients/${clientId}`);
  const n = parseLocations(clean).length;
  return { success: true, message: clean ? `Saved ${n} location${n === 1 ? "" : "s"}.` : "Locations cleared." };
}

/** Enable/disable the drip campaign and set the per-blog daily cap. */
export async function setLocationCampaign(
  clientId: string,
  opts: { enabled?: boolean; perDay?: number },
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (opts.enabled !== undefined) set.locationCampaignEnabled = opts.enabled;
  if (opts.perDay !== undefined) {
    set.locationPagesPerDay = Math.min(20, Math.max(1, Math.floor(opts.perDay)));
  }
  await db.update(clients).set(set).where(eq(clients.id, clientId));
  revalidatePath(`/clients/${clientId}`);
  return { success: true, message: "Campaign settings saved." };
}

// ─── build the matrix ─────────────────────────────────────────────────────────

/**
 * Build the (compound × location) target matrix for every blog of a peptides
 * client. Compounds come from each blog's locked style profile (assigned first
 * if missing); locations from the client's list. Idempotent — existing targets
 * are left untouched, so re-running only adds new (blog, compound, location)
 * combinations.
 */
export async function buildLocationMatrix(clientId: string): Promise<{
  success: boolean;
  created: number;
  blogsProcessed: number;
  message: string;
}> {
  const session = await requireAdmin();

  const [client] = await db
    .select({ id: clients.id, niche: clients.niche, locations: clients.peptideLocations })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { success: false, created: 0, blogsProcessed: 0, message: "Client not found." };
  if (!isPeptidesNiche(client.niche)) {
    return { success: false, created: 0, blogsProcessed: 0, message: "Location pages are available for peptides clients only." };
  }

  const locations = parseLocations(client.locations);
  if (locations.length === 0) {
    return { success: false, created: 0, blogsProcessed: 0, message: "Add target locations first." };
  }

  const blogRows = await db
    .select({ id: blogs.id })
    .from(blogs)
    .where(eq(blogs.clientId, clientId));
  if (blogRows.length === 0) {
    return { success: false, created: 0, blogsProcessed: 0, message: "This client has no blogs yet." };
  }

  const rows: (typeof peptideLocationTargets.$inferInsert)[] = [];
  let blogsProcessed = 0;
  for (const blog of blogRows) {
    let profile = await getStyleProfileForBlog(blog.id);
    if (!profile) {
      await assignProfileForBlogIfPeptides(blog.id).catch(() => undefined);
      profile = await getStyleProfileForBlog(blog.id);
    }
    const compounds = profile?.primaryCompounds ?? [];
    if (compounds.length === 0) continue; // no locked compounds → skip
    blogsProcessed++;
    for (const compound of compounds) {
      for (const location of locations) {
        rows.push({
          blogId: blog.id,
          clientId,
          compound,
          location,
          title: buildLocationTitle(compound, location),
        });
      }
    }
  }

  if (rows.length === 0) {
    return { success: false, created: 0, blogsProcessed, message: "No blogs have locked peptide compounds yet — generate a normal post first so each blog gets its style profile." };
  }

  const inserted = await db
    .insert(peptideLocationTargets)
    .values(rows)
    .onConflictDoNothing({
      target: [
        peptideLocationTargets.blogId,
        peptideLocationTargets.compound,
        peptideLocationTargets.location,
      ],
    })
    .returning({ id: peptideLocationTargets.id });

  await db.insert(activityLog).values({
    userId: session.user.id,
    clientId,
    action: "location_pages.matrix_built",
    entityType: "client",
    entityId: clientId,
    details: { blogsProcessed, created: inserted.length, locations: locations.length },
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    success: true,
    created: inserted.length,
    blogsProcessed,
    message: `Queued ${inserted.length} new location page${inserted.length === 1 ? "" : "s"} across ${blogsProcessed} blog${blogsProcessed === 1 ? "" : "s"}.`,
  };
}

// ─── read (UI) ────────────────────────────────────────────────────────────────

export interface LocationCampaignView {
  isPeptides: boolean;
  locations: string;
  enabled: boolean;
  perDay: number;
  counts: { pending: number; generated: number; failed: number; total: number };
  recent: LocationTarget[];
}

/** Campaign config + progress for a client, for the Location Pages tab. */
export async function getLocationCampaign(clientId: string): Promise<LocationCampaignView> {
  await requireAdmin();
  const [client] = await db
    .select({
      niche: clients.niche,
      locations: clients.peptideLocations,
      enabled: clients.locationCampaignEnabled,
      perDay: clients.locationPagesPerDay,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const countRows = await db
    .select({ status: peptideLocationTargets.status, c: count() })
    .from(peptideLocationTargets)
    .where(eq(peptideLocationTargets.clientId, clientId))
    .groupBy(peptideLocationTargets.status);

  const counts = { pending: 0, generated: 0, failed: 0, total: 0 };
  for (const r of countRows) {
    const n = Number(r.c);
    counts.total += n;
    if (r.status === "pending") counts.pending = n;
    else if (r.status === "generated") counts.generated = n;
    else if (r.status === "failed") counts.failed = n;
  }

  const recent = await db
    .select()
    .from(peptideLocationTargets)
    .where(eq(peptideLocationTargets.clientId, clientId))
    .orderBy(desc(peptideLocationTargets.updatedAt))
    .limit(50);

  return {
    isPeptides: isPeptidesNiche(client?.niche),
    locations: client?.locations ?? "",
    enabled: client?.enabled ?? false,
    perDay: client?.perDay ?? 2,
    counts,
    recent,
  };
}

// ─── drip (cron) ──────────────────────────────────────────────────────────────

/**
 * Generate up to each client's locationPagesPerDay pending location pages PER
 * BLOG, for every peptides client with an enabled campaign. Each page is a full
 * unique article via runGenerateAndPublish (so it gets the blog's style profile,
 * scrubber, CTA and internal links — not a thin doorway stub). Best-effort: a
 * failing page is marked 'failed' and the drip moves on. Bounded per run.
 */
export async function runLocationDripInternal(): Promise<{
  clientsProcessed: number;
  generated: number;
  failed: number;
  capped: boolean;
}> {
  const activeClients = await db
    .select({ id: clients.id, niche: clients.niche, perDay: clients.locationPagesPerDay })
    .from(clients)
    .where(eq(clients.locationCampaignEnabled, true));

  let generated = 0;
  let failed = 0;
  let clientsProcessed = 0;
  let capped = false;

  for (const client of activeClients) {
    if (!isPeptidesNiche(client.niche)) continue;
    clientsProcessed++;
    const perDay = Math.min(20, Math.max(1, client.perDay ?? 2));

    const clientBlogs = await db
      .select({ id: blogs.id })
      .from(blogs)
      .where(eq(blogs.clientId, client.id));

    for (const blog of clientBlogs) {
      if (generated + failed >= MAX_DRIP_PER_RUN) {
        capped = true;
        break;
      }
      const pending = await db
        .select()
        .from(peptideLocationTargets)
        .where(
          and(
            eq(peptideLocationTargets.blogId, blog.id),
            eq(peptideLocationTargets.status, "pending"),
          ),
        )
        .orderBy(peptideLocationTargets.createdAt)
        .limit(perDay);

      for (const target of pending) {
        if (generated + failed >= MAX_DRIP_PER_RUN) {
          capped = true;
          break;
        }
        if (await generateLocationTarget(target)) generated++;
        else failed++;
      }
      if (capped) break;
    }
    if (capped) break;
  }

  return { clientsProcessed, generated, failed, capped };
}

async function markFailed(id: string, reason: string): Promise<void> {
  await db
    .update(peptideLocationTargets)
    .set({ status: "failed", failureReason: reason.slice(0, 2000), updatedAt: new Date() })
    .where(eq(peptideLocationTargets.id, id));
}

/**
 * Generate + publish one location target as a full article. Marks it
 * 'generated' (with the post id) or 'failed'. Shared by the drip cron and the
 * admin "Generate now" action. Returns true on success.
 */
async function generateLocationTarget(target: LocationTarget): Promise<boolean> {
  try {
    const res = await runGenerateAndPublish({
      blogId: target.blogId,
      topic: target.title,
      keywords: buildLocationKeywords(target.compound, target.location),
      isAutoGenerated: true,
    });
    if (res.status === "failed") {
      await markFailed(target.id, res.message);
      return false;
    }
    await db
      .update(peptideLocationTargets)
      .set({
        status: "generated",
        generatedPostId: res.generatedPostId,
        failureReason: null,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(peptideLocationTargets.id, target.id));
    return true;
  } catch (err) {
    await markFailed(target.id, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** How many pending pages the on-demand "Generate now" button drips at once. */
const GENERATE_NOW_LIMIT = 3;

/**
 * Admin-triggered on-demand drip: generate up to a few of this client's pending
 * location pages right now (same pipeline as the daily cron), so operators can
 * test the campaign without waiting for 04:00 UTC. Synchronous — kept to a
 * small batch since each page is a full generate+publish.
 */
export async function generateLocationPagesNow(clientId: string): Promise<{
  success: boolean;
  generated: number;
  failed: number;
  message: string;
}> {
  await requireAdmin();

  const [client] = await db
    .select({ niche: clients.niche })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { success: false, generated: 0, failed: 0, message: "Client not found." };
  if (!isPeptidesNiche(client.niche)) {
    return { success: false, generated: 0, failed: 0, message: "Location pages are peptides-only." };
  }

  const pending = await db
    .select()
    .from(peptideLocationTargets)
    .where(
      and(
        eq(peptideLocationTargets.clientId, clientId),
        eq(peptideLocationTargets.status, "pending"),
      ),
    )
    .orderBy(peptideLocationTargets.createdAt)
    .limit(GENERATE_NOW_LIMIT);

  if (pending.length === 0) {
    return { success: false, generated: 0, failed: 0, message: "No pending pages — build the matrix first." };
  }

  let generated = 0;
  let failed = 0;
  for (const target of pending) {
    if (await generateLocationTarget(target)) generated++;
    else failed++;
  }

  revalidatePath(`/clients/${clientId}`);
  return {
    success: generated > 0,
    generated,
    failed,
    message:
      failed === 0
        ? `Generated ${generated} location page${generated === 1 ? "" : "s"}.`
        : `Generated ${generated}, ${failed} failed — check the targets list.`,
  };
}

/** Requeue this client's failed targets back to pending (retry). */
export async function retryFailedLocationTargets(
  clientId: string,
): Promise<{ success: boolean; requeued: number }> {
  await requireAdmin();
  const requeued = await db
    .update(peptideLocationTargets)
    .set({ status: "pending", failureReason: null, updatedAt: new Date() })
    .where(
      and(
        eq(peptideLocationTargets.clientId, clientId),
        eq(peptideLocationTargets.status, "failed"),
      ),
    )
    .returning({ id: peptideLocationTargets.id });
  revalidatePath(`/clients/${clientId}`);
  return { success: true, requeued: requeued.length };
}
