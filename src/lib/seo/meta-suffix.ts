/**
 * SEO meta suffixes and slugs.
 *
 * Replaces the deleted reddit.ts injector (T01). Three write surfaces:
 *
 *   - meta title       → optional " | {brand}" suffix, pixel-capped
 *   - meta description → pixel-capped, no suffix
 *   - URL slug/handle  → plain slug of the primary keyword, no suffix
 *
 * The brand is the DROP-FIRST element: it is appended only when the whole
 * keyword title already fits beside it inside TITLE_TARGET_PX. Keyword + city
 * are never traded away for the brand (docs/local-keyword-content-plan.md §5).
 * The brand must come from the operator-confirmed blogs.brand_name column —
 * NEVER from content/brand.ts's deriveBrandName(), which is a form-prefill
 * suggestion and explicitly not authoritative (see that module's header).
 *
 * Every function is idempotent: re-running on an already-normalized value is a
 * no-op aside from pixel-cap trimming, so republish / backfill / autofix can
 * all call them repeatedly.
 */

import {
  truncateToPx,
  measureTextPx,
  TITLE_FONT_PX,
  DESC_FONT_PX,
  TITLE_TARGET_PX,
  DESC_TARGET_PX,
} from "./text-width";

/** Separator between the keyword part of a meta title and the brand. */
export const BRAND_SEPARATOR = "|";

/** Max characters for a generated slug. */
const SLUG_MAX_CHARS = 60;
/** Max words for a generated slug — keeps handles short and readable. */
const SLUG_MAX_WORDS = 8;

/**
 * A trailing "reddit" token, with the separator that preceded it and any
 * punctuation that trailed it. Anchored to the END on purpose: the old
 * injector only ever appended, so a mid-sentence mention of Reddit in
 * operator-written copy is left alone.
 */
const TRAILING_REDDIT = /(?:\s*[|:,–—-])?\s*\breddit\b[\s.]*$/i;

/**
 * TEMPORARY (delete after the T01 backfill reports zero remaining rows).
 * Remove the trailing "Reddit" token the old injector appended, so any code
 * path that RE-normalizes a stored value — the SEO backfill, a republish, an
 * auto-fix — emits a clean value instead of preserving the token.
 *
 * A stored value of exactly "Reddit" (written by the pre-T01 empty-completion
 * bug) collapses to "", which lets the caller's fallback take over.
 */
export function stripLegacyRedditToken(text: string | null | undefined): string {
  let out = (text || "").replace(/\s+/g, " ").trim();
  // The generator AND the auto-fixer both appended, so a value can carry the
  // token more than once ("... Reddit Reddit"). Bounded loop, never unbounded.
  for (let i = 0; i < 4; i++) {
    const next = out.replace(TRAILING_REDDIT, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Comparison form: lowercase, punctuation flattened to single spaces. */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `title` already names `brand` (case- and punctuation-insensitive). */
function containsBrand(title: string, brand: string): boolean {
  const b = normalizeForCompare(brand);
  return b.length > 0 && normalizeForCompare(title).includes(b);
}

/**
 * Append " | {brandName}" to an SEO meta title, inside the strict-safe title
 * pixel budget. Idempotent, and a no-op when:
 *   - no brand is configured for the blog (brandName null/empty), or
 *   - the title already names the brand (e.g. local-target's titleLead), or
 *   - the keyword title does not fit beside the suffix — the brand yields
 *     FIRST, exactly the opposite of the old Reddit token, which yielded last.
 * The result is always pixel-capped, brand or no brand.
 */
export function appendBrandToTitle(
  title: string | null | undefined,
  brandName: string | null | undefined,
): string {
  const base = stripLegacyRedditToken(title);
  const brand = (brandName || "").replace(/\s+/g, " ").trim();

  if (!brand || containsBrand(base, brand)) {
    return truncateToPx(base, TITLE_FONT_PX, TITLE_TARGET_PX);
  }

  // No usable base (missing metaTitle AND missing fallback) — the brand alone
  // still beats an empty title tag.
  if (!base) return truncateToPx(brand, TITLE_FONT_PX, TITLE_TARGET_PX);

  const suffix = ` ${BRAND_SEPARATOR} ${brand}`;
  const budget = TITLE_TARGET_PX - measureTextPx(suffix, TITLE_FONT_PX);
  if (budget <= 0 || measureTextPx(base, TITLE_FONT_PX) > budget) {
    return truncateToPx(base, TITLE_FONT_PX, TITLE_TARGET_PX);
  }
  return `${base}${suffix}`;
}

/**
 * Pixel-cap a meta description to the strict-safe budget. No suffix of any
 * kind — a shorter accurate description beats a padded one. Idempotent.
 */
export function capMetaDescription(desc: string | null | undefined): string {
  const base = stripLegacyRedditToken(desc);
  return truncateToPx(base, DESC_FONT_PX, DESC_TARGET_PX);
}

/**
 * Plain URL slug for a new post, with NO suffix. Diacritics are folded
 * (é → e), so "École des Paris" becomes "ecole-des-paris".
 *
 * Returns "" when the source has no usable characters — the caller must then
 * omit `slug` entirely so WordPress / Shopify derive their own handle from the
 * title (the old code returned a bare "reddit" slug here).
 */
export function postSlug(source: string | null | undefined): string {
  // Prefer the primary-keyword segment when a separated meta title is passed
  // in (the title is "primary keyword | brand" by convention).
  const primary = stripLegacyRedditToken(source).split("|")[0];
  return slugifyBase(primary);
}

/** Lowercase, diacritic-folded, hyphen-joined slug of `text`. */
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
  let capped = slug.split("-").slice(0, SLUG_MAX_WORDS).join("-");
  if (capped.length > SLUG_MAX_CHARS) {
    capped = capped.slice(0, SLUG_MAX_CHARS).replace(/-[^-]*$/, "");
  }
  return capped.replace(/^-+|-+$/g, "");
}
