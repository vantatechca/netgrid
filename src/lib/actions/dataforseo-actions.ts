"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, clientKeywords, dataforseoRuns } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { resolveNicheConfig } from "@/lib/content/niche-config-db";
import {
  keywordSuggestions,
  dataForSeoConfigured,
  DataForSeoError,
} from "@/lib/services/dataforseo/client";
import { parseDataForSeoItems } from "@/lib/services/dataforseo/parse";

// Real search volume for the SAME per-client keyword pool the free
// Autocomplete scraper (keyword-actions.ts) already writes into — see
// docs/dataforseo-keyword-pipeline.md and the 0037 migration's header
// comment for why this reuses client_keywords instead of a separate store.
// Admin-triggered and on-demand only: a DataForSEO pull costs real money, so
// unlike the free Autocomplete scrape it is NOT wired into any cron.

/** Cap on how many seeds one pull processes — a real-money guardrail. */
const MAX_SEEDS_PER_RUN = 10;
/** Keywords requested per seed from keyword_suggestions. */
const RESULTS_PER_SEED = 200;
/** Hard ceiling on spend for one run. Overridable; see .env docs in render.yaml. */
const DEFAULT_MAX_RUN_COST = 5.0;

function maxRunCost(): number {
  const raw = process.env.DATAFORSEO_MAX_RUN_COST;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RUN_COST;
}

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

/**
 * DataForSEO location/language for a client — mirrors the same en/fr split
 * keyword-actions.ts's localeForLanguageMode already uses for Autocomplete,
 * so a client's market doesn't shift between the two keyword sources.
 * 2840 (United States) / 2124 (Canada) are DataForSEO's country-level
 * location codes — stable, unlike granular city-level codes; still worth
 * confirming against the live /locations endpoint per the plan's own
 * "verify before coding" caveat before trusting this for a new market.
 */
function localeForLanguageMode(mode: string | null | undefined): {
  locationCode: number;
  languageCode: string;
} {
  return mode === "fr" || mode === "en_fr"
    ? { locationCode: 2124, languageCode: "fr" }
    : { locationCode: 2840, languageCode: "en" };
}

export interface DataForSeoScrapeResult {
  success: boolean;
  seedsProcessed: number;
  seedsSucceeded: number;
  seedsFailed: number;
  keywordsUpserted: number;
  totalCost: number;
  message: string;
}

/**
 * Pull real search volume for a client's keywords via DataForSEO and upsert
 * them into client_keywords (source='dataforseo'). Seeds are sequential, not
 * concurrent — this is an on-demand admin action over a small (<=10) capped
 * seed list, not the background, many-blog cron the original plan's
 * concurrency-5-10 recommendation was written for. Sequential also keeps the
 * cost ceiling's guarantee exact: this run can overshoot MAX_RUN_COST by at
 * most one call's cost, never more.
 *
 * A failing seed does not abort the run — it's recorded in dataforseo_runs
 * and the next seed is attempted, mirroring the free Autocomplete scraper's
 * own fail-safe behavior.
 */
export async function scrapeClientKeywordsViaDataForSeo(
  clientId: string,
): Promise<DataForSeoScrapeResult> {
  await requireAdmin();

  if (!dataForSeoConfigured()) {
    return {
      success: false,
      seedsProcessed: 0,
      seedsSucceeded: 0,
      seedsFailed: 0,
      keywordsUpserted: 0,
      totalCost: 0,
      message: "DataForSEO is not configured — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.",
    };
  }

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
  if (!client) {
    return {
      success: false,
      seedsProcessed: 0,
      seedsSucceeded: 0,
      seedsFailed: 0,
      keywordsUpserted: 0,
      totalCost: 0,
      message: "Client not found.",
    };
  }

  const nicheConfig = await resolveNicheConfig(client.niche).catch(() => undefined);
  const nicheTopics = nicheConfig?.keyTopics ?? [];
  const manualSeeds = parseSeeds(client.keywordSeeds);
  const seeds = Array.from(
    new Set([...manualSeeds, ...nicheTopics.map((t) => t.toLowerCase())]),
  ).slice(0, MAX_SEEDS_PER_RUN);

  if (seeds.length === 0) {
    return {
      success: false,
      seedsProcessed: 0,
      seedsSucceeded: 0,
      seedsFailed: 0,
      keywordsUpserted: 0,
      totalCost: 0,
      message: "No seeds — add manual seeds or set a niche with key topics first.",
    };
  }

  const { locationCode, languageCode } = localeForLanguageMode(client.languageMode);
  const ceiling = maxRunCost();

  let seedsSucceeded = 0;
  let seedsFailed = 0;
  let keywordsUpserted = 0;
  let totalCost = 0;

  for (const seed of seeds) {
    if (totalCost >= ceiling) {
      await db.insert(dataforseoRuns).values({
        clientId,
        seed,
        endpoint: "dataforseo_labs/google/keyword_suggestions/live",
        locationCode,
        languageCode,
        status: "failed",
        error: `Run cost ceiling ($${ceiling.toFixed(2)}) reached — skipped without calling the API.`,
        finishedAt: new Date(),
      });
      seedsFailed++;
      continue;
    }

    const [run] = await db
      .insert(dataforseoRuns)
      .values({
        clientId,
        seed,
        endpoint: "dataforseo_labs/google/keyword_suggestions/live",
        locationCode,
        languageCode,
        status: "pending",
      })
      .returning({ id: dataforseoRuns.id });

    try {
      const result = await keywordSuggestions({
        keyword: seed,
        locationCode,
        languageCode,
        limit: RESULTS_PER_SEED,
      });
      totalCost += result.cost;

      const parsed = parseDataForSeoItems(result.items);
      const now = new Date();
      if (parsed.length > 0) {
        const upserted = await db
          .insert(clientKeywords)
          .values(
            parsed.map((p) => ({
              clientId,
              keyword: p.keyword,
              searchVolume: p.searchVolume,
              cpc: p.cpc != null ? p.cpc.toString() : null,
              source: "dataforseo",
              keywordDifficulty: p.keywordDifficulty,
              competition: p.competition != null ? p.competition.toString() : null,
              lowTopOfPageBid: p.lowTopOfPageBid != null ? p.lowTopOfPageBid.toString() : null,
              highTopOfPageBid: p.highTopOfPageBid != null ? p.highTopOfPageBid.toString() : null,
              monthlySearches: p.monthlySearches,
              mainIntent: p.mainIntent,
              locationCode,
              raw: p.raw,
              fetchedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: [clientKeywords.clientId, clientKeywords.keyword],
            // is_active (operator toggle) deliberately excluded — same
            // contract the Autocomplete scraper's upsert already honors.
            set: {
              searchVolume: sql`excluded.search_volume`,
              cpc: sql`excluded.cpc`,
              source: sql`excluded.source`,
              keywordDifficulty: sql`excluded.keyword_difficulty`,
              competition: sql`excluded.competition`,
              lowTopOfPageBid: sql`excluded.low_top_of_page_bid`,
              highTopOfPageBid: sql`excluded.high_top_of_page_bid`,
              monthlySearches: sql`excluded.monthly_searches`,
              mainIntent: sql`excluded.main_intent`,
              locationCode: sql`excluded.location_code`,
              raw: sql`excluded.raw`,
              fetchedAt: now,
              updatedAt: now,
            },
          })
          .returning({ id: clientKeywords.id });
        keywordsUpserted += upserted.length;
      }

      await db
        .update(dataforseoRuns)
        .set({
          status: "success",
          itemsReturned: parsed.length,
          cost: result.cost.toString(),
          finishedAt: new Date(),
        })
        .where(eq(dataforseoRuns.id, run.id));
      seedsSucceeded++;
    } catch (err) {
      const message =
        err instanceof DataForSeoError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      await db
        .update(dataforseoRuns)
        .set({ status: "failed", error: message.slice(0, 2000), finishedAt: new Date() })
        .where(eq(dataforseoRuns.id, run.id));
      seedsFailed++;
    }
  }

  revalidatePath(`/clients/${clientId}`);

  return {
    success: seedsSucceeded > 0,
    seedsProcessed: seeds.length,
    seedsSucceeded,
    seedsFailed,
    keywordsUpserted,
    totalCost,
    message:
      seedsSucceeded === 0
        ? `All ${seeds.length} seed(s) failed — see the run log.`
        : `${keywordsUpserted} keyword(s) upserted from ${seedsSucceeded}/${seeds.length} seed(s). Cost: $${totalCost.toFixed(4)}.`,
  };
}

/** Recent DataForSEO run history for a client — cost/debugging visibility. */
export async function listDataForSeoRuns(clientId: string) {
  await requireAdmin();
  return db
    .select()
    .from(dataforseoRuns)
    .where(eq(dataforseoRuns.clientId, clientId))
    .orderBy(dataforseoRuns.startedAt);
}
