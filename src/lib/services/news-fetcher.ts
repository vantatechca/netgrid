/**
 * News fetcher — pulls recent headlines for a vertical so the topic-
 * ideation step can brainstorm posts tied to current local/international
 * news instead of writing cold.
 *
 * Sources:
 *
 *   ALWAYS-ON (run in parallel per query):
 *     1. Google News RSS (no API key required)
 *          https://news.google.com/rss/search?q=...&hl=...&gl=...&ceid=...
 *        Google killed the official Google News API years ago; the public
 *        RSS endpoint is the only free Google-native path. Returns title,
 *        link, pubDate, source, snippet.
 *     2. NewsAPI.org (requires NEWS_API_KEY env var)
 *          https://newsapi.org/v2/everything?q=...
 *        Richer metadata, broader publisher coverage than Google News
 *        RSS for some niches. Free tier: 100 req/day.
 *
 *   TERTIARY BACKUP (only when 1+2 combined returned fewer than
 *   minResults items):
 *     3. GNews (requires GNEWS_API_KEY env var)
 *          https://gnews.io/api/v4/search?q=...
 *        Production-friendly alternative, free tier: 100 req/day.
 *
 * Results are merged across sources and deduped by link. Same wire
 * story appearing on multiple outlets via NewsAPI gets collapsed into
 * one row.
 *
 * NOTE: No DB writes here — this module returns parsed items. The action
 * layer (news-actions.ts) handles upserting into the news_items table.
 */

import * as cheerio from "cheerio";

export type NewsSource = "google_news_rss" | "newsapi" | "gnews";

export interface FetchedNewsItem {
  source: NewsSource;
  query: string;
  publisher: string | null;
  title: string;
  link: string;
  snippet: string | null;
  language: string | null;
  country: string | null;
  publishedAt: Date | null;
  raw: unknown;
}

export interface FetchNewsOptions {
  /** Free-text query, e.g. "Quebec roofing storm damage". */
  query: string;
  /** UI language hint. e.g. "en", "fr". */
  language?: string;
  /** Geo hint. e.g. "US", "CA". */
  country?: string;
  /** Max items to return. Default 10. */
  limit?: number;
  /** Maximum age in hours. Default 72 (3 days). */
  maxAgeHours?: number;
}

// ─── Google News RSS ────────────────────────────────────────────────────────
//
// The endpoint accepts hl (host language), gl (geo location), and ceid
// (country edition id) query params. The format is well-known and stable
// for many years — we use a lightweight XML parser to extract <item>
// children. No API key required.

function buildGoogleNewsRssUrl(opts: FetchNewsOptions): string {
  const language = opts.language ?? "en";
  const country = opts.country ?? "US";
  const ceid = `${country}:${language}`;
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", opts.query);
  url.searchParams.set("hl", language);
  url.searchParams.set("gl", country);
  url.searchParams.set("ceid", ceid);
  return url.toString();
}

function parseRfc822Date(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const stripped = input.replace(/<[^>]+>/g, "").trim();
  return stripped.length > 0 ? stripped : null;
}

/**
 * Fetch via Google News RSS. Returns up to `limit` items, filtered to
 * those published within `maxAgeHours` (default 72).
 */
export async function fetchGoogleNewsRss(
  opts: FetchNewsOptions,
): Promise<FetchedNewsItem[]> {
  const url = buildGoogleNewsRssUrl(opts);
  const limit = opts.limit ?? 10;
  const maxAgeHours = opts.maxAgeHours ?? 72;
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;

  let xml: string;
  try {
    const res = await fetch(url, {
      // Google occasionally throttles unbranded scrapers; mimic a normal
      // RSS reader UA to stay polite.
      headers: { "User-Agent": "NetgridNewsBot/1.0 (+https://netgrid.app)" },
      // Don't cache — the cron is the cache layer.
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Google News RSS returned ${res.status}`);
    }
    xml = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Google News RSS fetch failed: ${message}`);
  }

  // cheerio parses both HTML and XML; xmlMode keeps self-closing tags
  // intact and is case-sensitive (matches RSS element names exactly).
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xmlMode: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Google News RSS parse failed: ${message}`);
  }

  const items: FetchedNewsItem[] = [];
  $("rss > channel > item").each((_, el) => {
    if (items.length >= limit) return false;

    const $el = $(el);
    const title = $el.find("> title").first().text().trim();
    const link = $el.find("> link").first().text().trim();
    if (!title || !link) return undefined;

    const pubDate = parseRfc822Date($el.find("> pubDate").first().text());
    if (pubDate && pubDate.getTime() < cutoff) return undefined;

    const description = $el.find("> description").first().text();
    const publisher =
      $el.find("> source").first().text().trim() || null;

    items.push({
      source: "google_news_rss",
      query: opts.query,
      publisher,
      title,
      link,
      snippet: stripHtml(description),
      language: opts.language ?? null,
      country: opts.country ?? null,
      publishedAt: pubDate,
      raw: {
        title,
        link,
        pubDate: pubDate?.toISOString() ?? null,
        publisher,
        description,
      },
    });
    return undefined;
  });

  return items;
}

// ─── NewsAPI.org (optional fallback) ────────────────────────────────────────

interface NewsApiArticle {
  source?: { id?: string | null; name?: string | null };
  author?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  urlToImage?: string | null;
  publishedAt?: string | null;
  content?: string | null;
}

export async function fetchNewsApi(
  opts: FetchNewsOptions,
): Promise<FetchedNewsItem[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    throw new Error("NEWS_API_KEY env var is not set");
  }
  const limit = opts.limit ?? 10;
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", opts.query);
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("sortBy", "publishedAt");
  if (opts.language) url.searchParams.set("language", opts.language);

  const res = await fetch(url.toString(), {
    headers: { "X-Api-Key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`NewsAPI returned ${res.status}`);
  }
  const body = (await res.json()) as { articles?: NewsApiArticle[] };
  const articles = body.articles ?? [];

  return articles
    .filter((a): a is NewsApiArticle & { title: string; url: string } =>
      typeof a.title === "string" && typeof a.url === "string",
    )
    .map((a) => ({
      source: "newsapi" as const,
      query: opts.query,
      publisher: a.source?.name ?? null,
      title: a.title.trim(),
      link: a.url.trim(),
      snippet: a.description ?? null,
      language: opts.language ?? null,
      country: opts.country ?? null,
      publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
      raw: a,
    }));
}

// ─── GNews (optional fallback) ──────────────────────────────────────────────

interface GNewsArticle {
  title?: string | null;
  description?: string | null;
  content?: string | null;
  url?: string | null;
  image?: string | null;
  publishedAt?: string | null;
  source?: { name?: string | null; url?: string | null };
}

export async function fetchGNews(
  opts: FetchNewsOptions,
): Promise<FetchedNewsItem[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    throw new Error("GNEWS_API_KEY env var is not set");
  }
  const limit = opts.limit ?? 10;
  const url = new URL("https://gnews.io/api/v4/search");
  url.searchParams.set("q", opts.query);
  url.searchParams.set("max", String(limit));
  if (opts.language) url.searchParams.set("lang", opts.language);
  if (opts.country) url.searchParams.set("country", opts.country.toLowerCase());
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GNews returned ${res.status}`);
  }
  const body = (await res.json()) as { articles?: GNewsArticle[] };
  const articles = body.articles ?? [];

  return articles
    .filter((a): a is GNewsArticle & { title: string; url: string } =>
      typeof a.title === "string" && typeof a.url === "string",
    )
    .map((a) => ({
      source: "gnews" as const,
      query: opts.query,
      publisher: a.source?.name ?? null,
      title: a.title.trim(),
      link: a.url.trim(),
      snippet: a.description ?? null,
      language: opts.language ?? null,
      country: opts.country ?? null,
      publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
      raw: a,
    }));
}

// ─── Combined fetch with fallback ───────────────────────────────────────────

/**
 * Fetch news from Google News AND NewsAPI in parallel (when NEWS_API_KEY
 * is set), then merge results deduped by link. GNews stays as a tertiary
 * source — only queried when the combined Google + NewsAPI count is
 * still below `minResults` AND `GNEWS_API_KEY` is set.
 *
 * Strategy rationale:
 *   - Google News RSS and NewsAPI surface DIFFERENT articles for the
 *     same query (different crawler footprints, different syndication
 *     deals). Running both in parallel gives broader coverage than
 *     either alone, with no extra latency since they run concurrently.
 *   - Same story can appear in both (e.g. an AP wire piece on multiple
 *     outlets) — the link dedupe collapses those.
 *   - Promise.allSettled guarantees one source failing doesn't drop the
 *     other.
 */
export async function fetchNewsWithFallback(
  opts: FetchNewsOptions & { minResults?: number },
): Promise<FetchedNewsItem[]> {
  const minResults = opts.minResults ?? 5;
  const out: FetchedNewsItem[] = [];
  const seenLinks = new Set<string>();

  const push = (items: FetchedNewsItem[]) => {
    for (const item of items) {
      if (seenLinks.has(item.link)) continue;
      seenLinks.add(item.link);
      out.push(item);
    }
  };

  // Build the list of always-on sources. Google News RSS is always
  // included (free, no key). NewsAPI joins when its key is configured —
  // both fire in parallel so the slower source doesn't block the other.
  const sources: Array<{
    name: string;
    fetch: () => Promise<FetchedNewsItem[]>;
  }> = [
    { name: "Google News RSS", fetch: () => fetchGoogleNewsRss(opts) },
  ];
  if (process.env.NEWS_API_KEY) {
    sources.push({ name: "NewsAPI", fetch: () => fetchNewsApi(opts) });
  }

  const settled = await Promise.allSettled(sources.map((s) => s.fetch()));
  settled.forEach((result, i) => {
    const sourceName = sources[i].name;
    if (result.status === "fulfilled") {
      const before = out.length;
      push(result.value);
      console.info(
        `[news-fetcher] ${sourceName} → ${result.value.length} items ` +
          `(${out.length - before} new after dedupe) for "${opts.query}"`,
      );
    } else {
      console.warn(
        `[news-fetcher] ${sourceName} failed for "${opts.query}":`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  });

  // GNews tertiary backup — only when combined Google + NewsAPI is
  // still short of the minimum. Keeps GNews quota intact when the
  // primary sources have enough material.
  if (out.length < minResults && process.env.GNEWS_API_KEY) {
    try {
      const items = await fetchGNews(opts);
      const before = out.length;
      push(items);
      console.info(
        `[news-fetcher] GNews (backup) → ${items.length} items ` +
          `(${out.length - before} new after dedupe) for "${opts.query}"`,
      );
    } catch (err) {
      console.warn(
        `[news-fetcher] GNews failed for "${opts.query}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return out;
}
