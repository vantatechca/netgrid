"use server";

/**
 * News server actions — refresh + read for the topic-ideation pipeline.
 *
 * Refresh strategy (called by /api/cron/refresh-news once per day):
 *   for each vertical in the registry that has news_cycle or hybrid
 *   lifecycle:
 *     for each query derived from the vertical (topic angles +
 *       target locations crossed with the vertical name):
 *         call fetchNewsWithFallback()
 *         upsert returned items into news_items by (verticalKey, link)
 *
 * Read strategy (called by ideateTopic before sending the prompt):
 *   pull the most recent N unused items for the blog's vertical, mark
 *   them used, and return a compact text block the prompt can paste in.
 */

import { db } from "@/lib/db";
import { newsItems } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  fetchNewsWithFallback,
  type FetchedNewsItem,
} from "@/lib/services/news-fetcher";
import {
  verticalConfig,
  VERTICAL_KEYS,
  VERTICALS,
  type VerticalConfig,
} from "@/lib/content/verticals";
import type {
  NewsContextItem,
  RefreshNewsResult,
} from "@/lib/types/news";

// ─── Query builders ─────────────────────────────────────────────────────────

/**
 * Turns a vertical config into a small set of search queries. We try to
 * stay under ~6 queries per vertical to respect Google News throttling
 * and free-tier API budgets.
 *
 * Preferred path: vertical.searchTerms (explicit, news-friendly).
 * Fallback path: name + locations + data pipeline source labels —
 * works for local news-cycle verticals but tends to over-specify for
 * evergreen industry verticals.
 */
function buildQueriesForVertical(v: VerticalConfig): string[] {
  const queries: string[] = [];

  // Preferred: explicit search terms.
  if (v.searchTerms && v.searchTerms.length > 0) {
    for (const term of v.searchTerms) {
      queries.push(term);
      // For verticals with targetLocations, also pair the top location
      // with each term — gives geo-relevant headlines without doubling
      // the query budget.
      if (v.targetLocations[0]) {
        queries.push(`${term} ${v.targetLocations[0]}`);
      }
    }
    return Array.from(new Set(queries.filter((q) => q.length > 0))).slice(0, 6);
  }

  // Fallback: derive from name + locations + data-pipeline sources.
  queries.push(v.name);
  for (const loc of v.targetLocations.slice(0, 2)) {
    queries.push(`${v.name} ${loc}`);
  }
  for (const hint of v.dataPipelineHints.slice(0, 2)) {
    queries.push(`${hint.source} ${v.targetLocations[0] ?? ""}`.trim());
  }
  return Array.from(new Set(queries.filter((q) => q.length > 0))).slice(0, 6);
}

function languageHintFor(v: VerticalConfig): string {
  switch (v.language) {
    case "fr":
      return "fr";
    case "en_fr":
      return "en"; // bilingual verticals: fetch English; FR refresh handled by a second pass when needed
    default:
      return "en";
  }
}

function countryHintFor(v: VerticalConfig): string {
  // Quebec verticals → CA; charity defaults to CA; peptides default global → US.
  if (
    v.targetLocations.some((l) =>
      ["Québec", "Quebec", "Montréal", "Canada"].some((needle) =>
        l.includes(needle),
      ),
    )
  ) {
    return "CA";
  }
  if (v.geographyScope === "global") return "US";
  return "US";
}

// ─── Upsert ─────────────────────────────────────────────────────────────────

async function upsertItems(
  verticalKey: string,
  items: FetchedNewsItem[],
): Promise<number> {
  if (items.length === 0) return 0;

  let inserted = 0;
  for (const item of items) {
    const rows = await db
      .insert(newsItems)
      .values({
        verticalKey,
        query: item.query,
        source: item.source,
        publisher: item.publisher,
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        language: item.language,
        country: item.country,
        publishedAt: item.publishedAt,
        raw: item.raw as object,
      })
      .onConflictDoNothing({
        target: [newsItems.verticalKey, newsItems.link],
      })
      .returning({ id: newsItems.id });
    if (rows.length > 0) inserted += 1;
  }
  return inserted;
}

// ─── Refresh actions ────────────────────────────────────────────────────────
//
// Types live in src/lib/types/news.ts so this "use server" file only
// exports async functions (Next 14 rejects non-async exports in server
// action files).

/**
 * Refresh news for a single vertical. Runs for every vertical regardless
 * of lifecycle — evergreen verticals (peptides, roofing) benefit from
 * news too (industry developments, regulatory updates, market news),
 * and the ideation prompt already lets Claude skip the news angle when
 * no headline fits the niche.
 *
 * Pass { skipEvergreen: true } if you want to preserve the old behavior
 * (e.g. to cap quota usage when running a one-off refresh manually).
 */
export async function refreshNewsForVertical(
  verticalKey: string,
  opts: { skipEvergreen?: boolean; limitPerQuery?: number } = {},
): Promise<RefreshNewsResult> {
  await requireAdmin();
  return refreshNewsForVerticalInternal(verticalKey, opts);
}

// Internal version — same logic without the admin gate, callable from the
// cron route after it verifies the cron secret.
async function refreshNewsForVerticalInternal(
  verticalKey: string,
  opts: { skipEvergreen?: boolean; limitPerQuery?: number } = {},
): Promise<RefreshNewsResult> {
  const v = verticalConfig(verticalKey);
  if (!v) {
    return {
      verticalKey,
      queries: 0,
      fetched: 0,
      inserted: 0,
      errors: [`Vertical "${verticalKey}" not registered`],
    };
  }

  if (opts.skipEvergreen && v.lifecycle === "evergreen") {
    return {
      verticalKey,
      queries: 0,
      fetched: 0,
      inserted: 0,
      errors: ["Skipped (skipEvergreen=true and lifecycle is evergreen)"],
    };
  }

  const queries = buildQueriesForVertical(v);
  const language = languageHintFor(v);
  const country = countryHintFor(v);
  const limitPerQuery = opts.limitPerQuery ?? 8;

  let fetched = 0;
  let inserted = 0;
  const errors: string[] = [];

  for (const query of queries) {
    try {
      const items = await fetchNewsWithFallback({
        query,
        language,
        country,
        limit: limitPerQuery,
      });
      fetched += items.length;
      inserted += await upsertItems(verticalKey, items);
    } catch (err) {
      errors.push(
        `${query}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    verticalKey,
    queries: queries.length,
    fetched,
    inserted,
    errors,
  };
}

/**
 * Refresh news for every registered vertical. Called by the daily cron.
 *
 * Includes evergreen verticals (peptides, roofing) — industry news still
 * informs evergreen content (regulatory updates, market developments,
 * notable studies). The ideation prompt instructs Claude to skip the
 * news angle when no headline relates to the niche, so irrelevant
 * headlines don't pollute the topic stream.
 */
export async function refreshAllNews(): Promise<RefreshNewsResult[]> {
  return refreshAllNewsInternal();
}

export async function refreshAllNewsInternal(): Promise<RefreshNewsResult[]> {
  const results: RefreshNewsResult[] = [];
  for (const key of VERTICAL_KEYS) {
    // Note: no lifecycle skip — every vertical gets news. The ideation
    // step handles per-post relevance via the "skip the news angle if
    // no headline relates" prompt clause.
    void VERTICALS[key];
    results.push(await refreshNewsForVerticalInternal(key));
  }
  return results;
}

// ─── Read actions (used by ideation) ────────────────────────────────────────

/**
 * Returns the most recent `limit` unused news items for a vertical and
 * marks them used. Designed to be called from ideateTopic — the items
 * become topic-seed context for the next Claude call.
 *
 * If the vertical doesn't exist or has no rows, returns an empty array
 * (ideation falls back to its cold-start path).
 */
export async function takeNewsContextForVertical(
  verticalKey: string | null | undefined,
  limit = 6,
): Promise<NewsContextItem[]> {
  if (!verticalKey) return [];
  const v = verticalConfig(verticalKey);
  if (!v) return [];

  // Prefer unused items first; if there aren't enough, fill from the
  // recent pool regardless of used flag (better stale context than no
  // context).
  const unused = await db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      publisher: newsItems.publisher,
      publishedAt: newsItems.publishedAt,
      snippet: newsItems.snippet,
      link: newsItems.link,
    })
    .from(newsItems)
    .where(
      and(
        eq(newsItems.verticalKey, verticalKey),
        eq(newsItems.usedInIdeation, false),
      ),
    )
    .orderBy(desc(newsItems.publishedAt))
    .limit(limit);

  // Annotate explicitly so .map / .push below have a concrete row type
  // (the Drizzle inferred row shape from select() above).
  const picks: NewsContextItem[] = unused.map((row) => ({
    id: row.id,
    title: row.title,
    publisher: row.publisher,
    publishedAt: row.publishedAt,
    snippet: row.snippet,
    link: row.link,
  }));
  if (picks.length < limit) {
    const filler = await db
      .select({
        id: newsItems.id,
        title: newsItems.title,
        publisher: newsItems.publisher,
        publishedAt: newsItems.publishedAt,
        snippet: newsItems.snippet,
        link: newsItems.link,
      })
      .from(newsItems)
      .where(eq(newsItems.verticalKey, verticalKey))
      .orderBy(desc(newsItems.publishedAt))
      .limit(limit);
    const seen = new Set<string>(picks.map((p: NewsContextItem) => p.id));
    for (const row of filler) {
      if (seen.has(row.id)) continue;
      picks.push({
        id: row.id,
        title: row.title,
        publisher: row.publisher,
        publishedAt: row.publishedAt,
        snippet: row.snippet,
        link: row.link,
      });
      if (picks.length >= limit) break;
    }
  }

  // Mark the unused ones as used so subsequent ideation calls rotate
  // through fresh headlines.
  const idsToMark: string[] = unused.map((p: { id: string }) => p.id);
  if (idsToMark.length > 0) {
    await db
      .update(newsItems)
      .set({ usedInIdeation: true })
      .where(inArray(newsItems.id, idsToMark));
  }

  return picks;
}

/**
 * Read-only — does NOT mark items as used. For admin dashboards.
 */
export async function getRecentNewsForVertical(
  verticalKey: string,
  limit = 20,
): Promise<NewsContextItem[]> {
  await requireAdmin();
  return db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      publisher: newsItems.publisher,
      publishedAt: newsItems.publishedAt,
      snippet: newsItems.snippet,
      link: newsItems.link,
    })
    .from(newsItems)
    .where(eq(newsItems.verticalKey, verticalKey))
    .orderBy(desc(newsItems.publishedAt))
    .limit(limit);
}

// ─── Maintenance ────────────────────────────────────────────────────────────

/**
 * Deletes news items older than `days` (default 30). Called nightly by
 * the same cron as refresh.
 */
export async function prunOldNewsInternal(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const result = await db
    .delete(newsItems)
    .where(lt(newsItems.fetchedAt, cutoff))
    .returning({ id: newsItems.id });
  return result.length;
}

/**
 * Format news items into a compact text block for prompt injection.
 * Each line: "- TITLE (PUBLISHER, DATE)"
 */
export async function formatNewsContextForPrompt(
  items: NewsContextItem[],
): Promise<string> {
  if (items.length === 0) return "";
  const lines = items.map((item) => {
    const parts: string[] = [item.title];
    const meta: string[] = [];
    if (item.publisher) meta.push(item.publisher);
    if (item.publishedAt) {
      const d = item.publishedAt;
      const iso = d.toISOString().slice(0, 10);
      meta.push(iso);
    }
    if (meta.length > 0) parts.push(`(${meta.join(", ")})`);
    return `- ${parts.join(" ")}`;
  });
  return lines.join("\n");
}

// Silence "unused import" lint warning for sql — kept for future
// aggregate queries (e.g. count per vertical for an admin dashboard).
void sql;
