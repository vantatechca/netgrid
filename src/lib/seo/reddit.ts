/**
 * Reddit SEO injection.
 *
 * AI answer engines (and Google's AI Overviews) disproportionately cite pages
 * whose <title> / meta description / URL mention Reddit, because Reddit threads
 * are treated as high-trust community discussion. To ride that signal WITHOUT
 * polluting the human-facing article, we inject the token "Reddit" into the SEO
 * surface only:
 *
 *   - meta title  (the <title> tag / Yoast|RankMath title / Shopify title_tag)
 *   - meta description (<meta name="description"> / description_tag)
 *   - URL slug / handle
 *
 * The pattern is "[keyword] reddit" — the primary keyword followed by the
 * token. The visible article title (H1) and body are NEVER touched, so the word
 * never appears in the actual article the reader sees.
 *
 * Every function here is idempotent: a value that already contains a
 * word-boundary "reddit" is returned unchanged (aside from pixel-cap trimming),
 * so re-running normalization on already-injected values (republish, backfill,
 * autofix) never double-appends.
 */

import {
  truncateToPx,
  measureTextPx,
  TITLE_FONT_PX,
  DESC_FONT_PX,
  TITLE_TARGET_PX,
  DESC_TARGET_PX,
} from "./text-width";

/** The token we inject. Capitalized for the title/description surface. */
export const REDDIT_TOKEN = "Reddit";

/** Max characters for the generated slug base (before the "-reddit" suffix). */
const SLUG_BASE_MAX_CHARS = 60;
/** Max words for the generated slug base — keeps handles short and readable. */
const SLUG_BASE_MAX_WORDS = 8;

/** True when `text` already contains "reddit" as a standalone word. */
export function hasReddit(text: string | null | undefined): boolean {
  return !!text && /\breddit\b/i.test(text);
}

/**
 * Append " Reddit" to an SEO meta title, keeping the result inside the
 * strict-safe title pixel budget. The base is trimmed to leave room for the
 * suffix so the token always survives the cap. Idempotent.
 */
export function appendRedditToTitle(title: string | null | undefined): string {
  const base = (title || "").replace(/\s+/g, " ").trim();
  if (hasReddit(base)) {
    return truncateToPx(base, TITLE_FONT_PX, TITLE_TARGET_PX);
  }
  const suffix = ` ${REDDIT_TOKEN}`;
  const suffixPx = measureTextPx(suffix, TITLE_FONT_PX);
  const budget = Math.max(0, TITLE_TARGET_PX - suffixPx);
  const trimmedBase = truncateToPx(base, TITLE_FONT_PX, budget);
  return `${trimmedBase}${suffix}`.trim();
}

/**
 * Append " Reddit" to a meta description, keeping the result inside the
 * strict-safe description pixel budget. Idempotent.
 */
export function appendRedditToDescription(
  desc: string | null | undefined,
): string {
  const base = (desc || "").replace(/\s+/g, " ").trim();
  if (hasReddit(base)) {
    return truncateToPx(base, DESC_FONT_PX, DESC_TARGET_PX);
  }
  const suffix = ` ${REDDIT_TOKEN}`;
  const suffixPx = measureTextPx(suffix, DESC_FONT_PX);
  const budget = Math.max(0, DESC_TARGET_PX - suffixPx);
  const trimmedBase = truncateToPx(base, DESC_FONT_PX, budget);
  return `${trimmedBase}${suffix}`.trim();
}

/**
 * Slugify `source` and append "-reddit", producing the "[keyword]-reddit"
 * URL handle. Diacritics are folded (é → e), so "École des Paris" becomes
 * "ecole-des-paris-reddit". Idempotent: a source already ending in "reddit"
 * is not doubled. Falls back to a bare "reddit" slug if the source has no
 * usable characters.
 */
export function redditSlug(source: string | null | undefined): string {
  // Prefer the primary-keyword segment when a separated meta title is passed
  // in (the title is "primary keyword | secondary" by convention).
  const primary = (source || "").split("|")[0];
  const base = slugifyBase(primary);
  if (!base) return "reddit";
  if (/(?:^|-)reddit$/.test(base)) return base;
  return `${base}-reddit`;
}

/** Lowercase, diacritic-folded, hyphen-joined slug of `text` (no suffix). */
function slugifyBase(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!slug) return "";

  // Cap length by words first, then hard-cap characters, breaking on a hyphen
  // boundary so we never emit a dangling partial word.
  let capped = slug.split("-").slice(0, SLUG_BASE_MAX_WORDS).join("-");
  if (capped.length > SLUG_BASE_MAX_CHARS) {
    capped = capped.slice(0, SLUG_BASE_MAX_CHARS).replace(/-[^-]*$/, "");
  }
  return capped.replace(/^-+|-+$/g, "");
}
