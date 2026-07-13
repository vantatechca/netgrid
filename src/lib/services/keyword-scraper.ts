import "server-only";

// Keyword discovery via Google Autocomplete.
//
// Free, no API key, no search volume — great for long-tail / intent discovery
// (the "alphabet soup" technique). Each seed is queried on its own and with an
// appended letter a–z, and Google returns suggestions in rough popularity order,
// so a term's best position across queries plus how many seed queries surfaced
// it (hitCount) form a usable popularity proxy when no real volume is available.
//
// The provider is deliberately isolated behind ScrapedKeyword[] so a
// volume-bearing source (Bing Webmaster, DataForSEO) can be added later without
// touching the storage/binding layers.

export interface ScrapedKeyword {
  keyword: string;
  /** How many distinct seed queries surfaced this term (popularity proxy). */
  hitCount: number;
  /** Best (lowest) suggestion position seen across queries; lower = better. */
  bestPosition: number;
  source: "google_autocomplete";
}

export interface ScrapeOptions {
  /** UI language, e.g. "en" | "fr". */
  lang?: string;
  /** Geo, e.g. "us" | "ca". */
  country?: string;
  /** Append a–z to each seed for long-tail expansion. Default true. */
  alphabetSoup?: boolean;
  /** Max seeds actually queried (guards the request budget). Default 12. */
  maxSeeds?: number;
  /** Max keywords returned after aggregation. Default 300. */
  limit?: number;
}

const AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
/** Concurrency for the many small suggest requests. */
const CONCURRENCY = 6;

/** One Google Autocomplete query → ordered suggestion strings ([] on failure). */
async function autocomplete(
  query: string,
  lang: string,
  country: string,
): Promise<string[]> {
  const url =
    `${AUTOCOMPLETE_URL}?client=chrome` +
    `&q=${encodeURIComponent(query)}` +
    `&hl=${encodeURIComponent(lang)}` +
    `&gl=${encodeURIComponent(country)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; netgrid-keyword-bot/1.0)" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    // Chrome client shape: [query, [suggestions...], ...].
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return (data[1] as unknown[]).map((s) => String(s));
    }
    return [];
  } catch {
    return [];
  }
}

/** Run async tasks with a small fixed concurrency cap. */
async function pooled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  );
  return out;
}

/** Normalize a suggestion/seed for dedupe + storage. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Expand seeds into a de-duplicated, popularity-ranked keyword list via Google
 * Autocomplete. Seeds themselves are not emitted unless Google echoes them.
 * Fail-safe: individual query failures are skipped; a total failure returns [].
 */
export async function scrapeKeywords(
  seeds: string[],
  opts: ScrapeOptions = {},
): Promise<ScrapedKeyword[]> {
  const lang = opts.lang?.trim() || "en";
  const country = opts.country?.trim() || "us";
  const alphabetSoup = opts.alphabetSoup !== false;
  const maxSeeds = opts.maxSeeds ?? 12;
  const limit = opts.limit ?? 300;

  const cleanSeeds = Array.from(
    new Set(seeds.map(normalize).filter(Boolean)),
  ).slice(0, maxSeeds);
  if (cleanSeeds.length === 0) return [];

  // Build the query list: each seed bare, plus "seed a".."seed z".
  const queries: string[] = [];
  for (const seed of cleanSeeds) {
    queries.push(seed);
    if (alphabetSoup) {
      for (const l of LETTERS) queries.push(`${seed} ${l}`);
    }
  }

  const results = await pooled(
    queries,
    (q) => autocomplete(q, lang, country),
    CONCURRENCY,
  );

  // Aggregate: hitCount = number of queries surfacing the term; bestPosition =
  // lowest index it appeared at across queries.
  const agg = new Map<string, { hitCount: number; bestPosition: number }>();
  for (const suggestions of results) {
    suggestions.forEach((raw, idx) => {
      const kw = normalize(raw);
      if (!kw || kw.length > 200) return;
      const prev = agg.get(kw);
      if (prev) {
        prev.hitCount += 1;
        if (idx < prev.bestPosition) prev.bestPosition = idx;
      } else {
        agg.set(kw, { hitCount: 1, bestPosition: idx });
      }
    });
  }

  return Array.from(agg.entries())
    .map(([keyword, v]) => ({
      keyword,
      hitCount: v.hitCount,
      bestPosition: v.bestPosition,
      source: "google_autocomplete" as const,
    }))
    .sort(
      (a, b) =>
        b.hitCount - a.hitCount ||
        a.bestPosition - b.bestPosition ||
        a.keyword.length - b.keyword.length,
    )
    .slice(0, limit);
}
