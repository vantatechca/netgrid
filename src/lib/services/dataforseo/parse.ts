// Pure DataForSEO response → row mapping. Deliberately separate from
// client.ts (which does I/O) so this can be fixture-tested without a network
// call or mocking fetch — see parse.test.ts.
//
// Every extraction is defensive: a missing or unexpectedly-shaped field
// yields null, never a throw. That matters specifically for restricted
// verticals (see docs/local-keyword-content-plan.md and the original
// DataForSEO brief §7.2) — Google restricts ads on many research compounds,
// so cpc/competition/bid fields routinely come back null there. Nulls are
// expected, not errors.

import type { DataForSeoKeywordItem } from "./types";

export interface ParsedKeywordItem {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  lowTopOfPageBid: number | null;
  highTopOfPageBid: number | null;
  monthlySearches: Array<{ year: number; month: number; searchVolume: number }> | null;
  keywordDifficulty: number | null;
  mainIntent: string | null;
  /** The untouched API item — persisted so reprocessing never re-queries the API. */
  raw: unknown;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** One response item -> a row-ready shape, or null if it has no usable keyword text. */
export function parseDataForSeoItem(item: DataForSeoKeywordItem): ParsedKeywordItem | null {
  const keyword = typeof item?.keyword === "string" ? item.keyword.trim() : "";
  if (!keyword) return null;

  const info = item.keyword_info ?? {};
  const props = item.keyword_properties ?? {};
  const intent = item.search_intent_info ?? {};

  const monthlySearches = Array.isArray(info.monthly_searches)
    ? info.monthly_searches
        .filter(
          (m): m is { year: number; month: number; search_volume?: number | null } =>
            typeof m?.year === "number" && typeof m?.month === "number",
        )
        .map((m) => ({ year: m.year, month: m.month, searchVolume: num(m.search_volume) ?? 0 }))
    : null;

  return {
    keyword,
    searchVolume: num(info.search_volume),
    cpc: num(info.cpc),
    competition: num(info.competition),
    lowTopOfPageBid: num(info.low_top_of_page_bid),
    highTopOfPageBid: num(info.high_top_of_page_bid),
    monthlySearches: monthlySearches && monthlySearches.length > 0 ? monthlySearches : null,
    keywordDifficulty: num(props.keyword_difficulty),
    mainIntent: typeof intent.main_intent === "string" ? intent.main_intent : null,
    raw: item,
  };
}

/** Parse a whole response batch, dropping any item with no usable keyword. */
export function parseDataForSeoItems(items: DataForSeoKeywordItem[]): ParsedKeywordItem[] {
  const out: ParsedKeywordItem[] = [];
  for (const item of items) {
    const parsed = parseDataForSeoItem(item);
    if (parsed) out.push(parsed);
  }
  return out;
}
