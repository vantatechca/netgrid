"use server";

import { revalidatePath } from "next/cache";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, clientKeywords, clients } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { resolveNicheConfig } from "@/lib/content/niche-config-db";
import { scrapeKeywords } from "@/lib/services/keyword-scraper";

export type ClientKeyword = typeof clientKeywords.$inferSelect;

/** Cap on keywords stored per client per scrape (top-ranked kept). */
const STORE_LIMIT = 300;

/** Split a free-text seed field (newlines and/or commas) into clean terms. */
function parseSeeds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

/** Autocomplete locale for a client — French clients scrape fr/ca, else en/us. */
function localeForLanguageMode(mode: string | null | undefined): {
  lang: string;
  country: string;
} {
  return mode === "fr" || mode === "en_fr"
    ? { lang: "fr", country: "ca" }
    : { lang: "en", country: "us" };
}

// ─── scrapeClientKeywords ─────────────────────────────────────────────────────

/**
 * Discover keywords for a client and upsert them into client_keywords. Seeds
 * come from the client's niche key-topics plus its manual seed field. Existing
 * rows are refreshed in place (their active toggle is preserved). Fail-safe:
 * a scraper that returns nothing leaves existing rows untouched.
 */
export async function scrapeClientKeywords(clientId: string): Promise<{
  success: boolean;
  inserted: number;
  total: number;
  message: string;
}> {
  const session = await requireAdmin();

  const [client] = await db
    .select({
      id: clients.id,
      niche: clients.niche,
      keywordSeeds: clients.keywordSeeds,
      languageMode: clients.languageMode,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { success: false, inserted: 0, total: 0, message: "Client not found." };

  // Seeds: niche key-topics + manual seeds.
  const nicheConfig = await resolveNicheConfig(client.niche).catch(() => undefined);
  const nicheTopics = nicheConfig?.keyTopics ?? [];
  const manualSeeds = parseSeeds(client.keywordSeeds);
  const seeds = Array.from(new Set([...manualSeeds, ...nicheTopics.map((t) => t.toLowerCase())]));

  if (seeds.length === 0) {
    return {
      success: false,
      inserted: 0,
      total: 0,
      message: "No seeds — add manual seeds or set a niche with key topics first.",
    };
  }

  const locale = localeForLanguageMode(client.languageMode);
  const scraped = await scrapeKeywords(seeds, { ...locale, limit: STORE_LIMIT });

  if (scraped.length === 0) {
    return {
      success: false,
      inserted: 0,
      total: await countClientKeywords(clientId),
      message: "The scraper returned no keywords (autocomplete unavailable or seeds too narrow).",
    };
  }

  const now = new Date();
  const inserted = await db
    .insert(clientKeywords)
    .values(
      scraped.map((k) => ({
        clientId,
        keyword: k.keyword,
        source: k.source,
        hitCount: k.hitCount,
        bestPosition: k.bestPosition,
        fetchedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [clientKeywords.clientId, clientKeywords.keyword],
      // Refresh discovery signals; leave is_active (operator toggle) untouched.
      set: {
        hitCount: sql`excluded.hit_count`,
        bestPosition: sql`excluded.best_position`,
        source: sql`excluded.source`,
        fetchedAt: sql`excluded.fetched_at`,
        updatedAt: now,
      },
    })
    .returning({ id: clientKeywords.id });

  await db.insert(activityLog).values({
    userId: session.user.id,
    clientId,
    action: "keywords.scraped",
    entityType: "client",
    entityId: clientId,
    details: { seeds: seeds.length, found: scraped.length },
  });

  revalidatePath(`/clients/${clientId}`);
  return {
    success: true,
    inserted: inserted.length,
    total: await countClientKeywords(clientId),
    message: `Scraped ${scraped.length} keyword${scraped.length === 1 ? "" : "s"} from ${seeds.length} seed${seeds.length === 1 ? "" : "s"}.`,
  };
}

async function countClientKeywords(clientId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(clientKeywords)
    .where(eq(clientKeywords.clientId, clientId));
  return Number(row?.c ?? 0);
}

// ─── reads + toggles ──────────────────────────────────────────────────────────

/** All keywords for a client, best-ranked first. */
export async function listClientKeywords(clientId: string): Promise<ClientKeyword[]> {
  await requireAdmin();
  return db
    .select()
    .from(clientKeywords)
    .where(eq(clientKeywords.clientId, clientId))
    .orderBy(
      // Volume when a volume-bearing source is used; else the autocomplete proxy.
      sql`${clientKeywords.searchVolume} desc nulls last`,
      desc(clientKeywords.hitCount),
      asc(clientKeywords.bestPosition),
    );
}

/** Toggle whether a keyword is fed into generation. */
export async function setClientKeywordActive(
  id: string,
  isActive: boolean,
): Promise<ClientKeyword> {
  await requireAdmin();
  const [updated] = await db
    .update(clientKeywords)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(clientKeywords.id, id))
    .returning();
  if (!updated) throw new Error("Keyword not found.");
  revalidatePath(`/clients/${updated.clientId}`);
  return updated;
}

/** Remove a keyword from a client's set. */
export async function deleteClientKeyword(id: string): Promise<void> {
  await requireAdmin();
  const [deleted] = await db
    .delete(clientKeywords)
    .where(eq(clientKeywords.id, id))
    .returning({ clientId: clientKeywords.clientId });
  if (deleted) revalidatePath(`/clients/${deleted.clientId}`);
}

/** Save a client's manual seed terms (used by the next scrape). */
export async function updateClientKeywordSeeds(
  clientId: string,
  seeds: string,
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();
  const clean = seeds.trim();
  await db
    .update(clients)
    .set({ keywordSeeds: clean || null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  revalidatePath(`/clients/${clientId}`);
  return { success: true, message: clean ? "Seeds saved." : "Seeds cleared." };
}

// ─── cron: refresh every client ───────────────────────────────────────────────

/**
 * Re-scrape keywords for every client that has at least one seed source (manual
 * seeds or a niche). Called by /api/cron/refresh-keywords. Never throws — a
 * failing client is recorded and skipped so one bad client can't stall the run.
 */
export async function refreshAllClientKeywordsInternal(): Promise<{
  clientsProcessed: number;
  clientsScraped: number;
  keywordsFound: number;
}> {
  const rows = await db
    .select({ id: clients.id, niche: clients.niche, keywordSeeds: clients.keywordSeeds })
    .from(clients);

  let clientsScraped = 0;
  let keywordsFound = 0;
  for (const c of rows) {
    const hasSeeds = parseSeeds(c.keywordSeeds).length > 0 || Boolean(c.niche?.trim());
    if (!hasSeeds) continue;
    try {
      const res = await scrapeClientKeywordsInternal(c.id);
      if (res.scraped > 0) {
        clientsScraped++;
        keywordsFound += res.scraped;
      }
    } catch (err) {
      console.warn(
        `[refresh-keywords] client ${c.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { clientsProcessed: rows.length, clientsScraped, keywordsFound };
}

/**
 * Cron-internal scrape for one client — same discovery + upsert as
 * scrapeClientKeywords but without the admin guard or path revalidation (runs
 * under the cron's CRON_SECRET auth).
 */
async function scrapeClientKeywordsInternal(
  clientId: string,
): Promise<{ scraped: number }> {
  const [client] = await db
    .select({
      niche: clients.niche,
      keywordSeeds: clients.keywordSeeds,
      languageMode: clients.languageMode,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { scraped: 0 };

  const nicheConfig = await resolveNicheConfig(client.niche).catch(() => undefined);
  const nicheTopics = nicheConfig?.keyTopics ?? [];
  const seeds = Array.from(
    new Set([...parseSeeds(client.keywordSeeds), ...nicheTopics.map((t) => t.toLowerCase())]),
  );
  if (seeds.length === 0) return { scraped: 0 };

  const locale = localeForLanguageMode(client.languageMode);
  const scraped = await scrapeKeywords(seeds, { ...locale, limit: STORE_LIMIT });
  if (scraped.length === 0) return { scraped: 0 };

  const now = new Date();
  await db
    .insert(clientKeywords)
    .values(
      scraped.map((k) => ({
        clientId,
        keyword: k.keyword,
        source: k.source,
        hitCount: k.hitCount,
        bestPosition: k.bestPosition,
        fetchedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [clientKeywords.clientId, clientKeywords.keyword],
      set: {
        hitCount: sql`excluded.hit_count`,
        bestPosition: sql`excluded.best_position`,
        source: sql`excluded.source`,
        fetchedAt: sql`excluded.fetched_at`,
        updatedAt: now,
      },
    });

  return { scraped: scraped.length };
}
