// Local keyword-targeted content — title templating + keyword filtering.
//
// Turns one of a blog's own scraped keywords (client_keywords, via
// topActiveClientKeywordsWithMeta) plus the blog's assigned city into a
// candidate post: a title, and a pass/fail decision on whether the keyword is
// even a sane candidate to pair with a city at all. See
// docs/local-keyword-content-plan.md §4.
//
// Dependency-free, mirroring location-targeting.ts — usable both server-side
// (target building) and for an admin UI preview of the matrix.

/** Which frame a keyword's title should take. See detectKeywordIntent. */
export type KeywordIntent = "transactional" | "comparison" | "informational";

/** Stable non-negative hash of a string (djb2). Deterministic — no RNG. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Title-case a raw keyword/city for display in a title. */
function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Trim/lowercase/collapse-whitespace a keyword for filtering and dedup. */
export function normalizeTargetKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

// ─── Intent detection ──────────────────────────────────────────────────────

// A keyword may legitimately match more than one bucket ("best place to buy
// peptides" is both). Checked in this order — transactional and comparison
// are the two cases where an "informational" frame would be actively wrong,
// so they take priority; anything left over defaults to informational, the
// safest generic frame for a query with no clear signal.
const TRANSACTIONAL_SIGNALS = [
  "buy", "price", "pricing", "cost", "for sale", "near me", "order",
  "shop", "purchase", "cheap", "discount", "delivery", "deal", "deals",
];
const COMPARISON_SIGNALS = [
  "vs", "versus", "compare", "comparison", "alternative", "alternatives",
  "best", "top",
];

/** Classify a keyword's search intent so the title frame actually fits it. */
export function detectKeywordIntent(keyword: string): KeywordIntent {
  const k = normalizeTargetKeyword(keyword);
  if (TRANSACTIONAL_SIGNALS.some((w) => k.includes(w))) return "transactional";
  if (COMPARISON_SIGNALS.some((w) => k.includes(w))) return "comparison";
  return "informational";
}

// ─── Title templates ────────────────────────────────────────────────────────
//
// {k} = keyword, {city} = the blog's assigned city. Deliberately niche-
// agnostic (no "dosage", no compound-specific wording) since a target can be
// a pizzeria as easily as a peptide site. Several templates per intent, one
// picked deterministically by hash(keyword|city) so titles vary across the
// network but stay stable across rebuilds.

const TRANSACTIONAL_TEMPLATES = [
  "Where to Buy {k} in {city}: Pricing & Availability",
  "{k} in {city} — Cost, Sourcing & What to Know",
  "Is {k} Available in {city}? A Practical Buyer's Guide",
  "{k} in {city}: Availability, Pricing & Delivery",
  "Best Places for {k} in {city}",
];

const COMPARISON_TEMPLATES = [
  "{k} in {city}: What to Compare Before You Choose",
  "{k} in {city} — Options, Pricing & What Sets Them Apart",
  "Comparing {k} in {city}: A Local Buyer's Guide",
];

const INFORMATIONAL_TEMPLATES = [
  "{k} in {city}: What Locals Should Know",
  "{k} in {city} — A Practical Guide",
  "Everything to Know About {k} in {city}",
  "{k} in {city}: What to Expect",
];

function templatesFor(intent: KeywordIntent): string[] {
  switch (intent) {
    case "transactional": return TRANSACTIONAL_TEMPLATES;
    case "comparison": return COMPARISON_TEMPLATES;
    case "informational": return INFORMATIONAL_TEMPLATES;
  }
}

/**
 * The title for one (keyword, city) target. Intent-aware — a "buy" keyword
 * gets a transactional frame, an informational one doesn't get told to shop.
 */
export function buildKeywordTargetTitle(keyword: string, city: string): string {
  const intent = detectKeywordIntent(keyword);
  const templates = templatesFor(intent);
  const k = titleCase(coreTopic(normalizeTargetKeyword(keyword), intent));
  const c = titleCase(city);
  const template = templates[hash(`${keyword}|${city}`) % templates.length];
  return template.replace(/\{k\}/g, k).replace(/\{city\}/g, c);
}

// A scraped keyword is often already a full query — "where to buy peptides",
// "buy peptides" — not a bare product name the way a peptide compound is.
// "Where to Buy {k}" duplicates the word "buy" when {k} itself starts with
// "buy"/"where to buy" ("Where to Buy Buy Peptides..."). Strip ONLY that
// literal overlap, and nothing else: a qualifier like "cheap"/"online"/
// "for sale"/"price" doesn't repeat any template wording, so leaving it in
// keeps otherwise-similar keywords ("cheap peptides" vs "peptides online")
// producing DIFFERENT titles instead of collapsing them to the same string —
// over-stripping was tried and rejected for exactly that reason (verified
// against a sample of Autocomplete's near-duplicate "alphabet soup" variants,
// which routinely differ only by a trailing qualifier). The ORIGINAL keyword
// is still what's stored on the ledger row and fed to generation regardless —
// this only ever affects the displayed title.
const BUY_PREFIX_STRIP = [
  /^where\s+to\s+buy\s+/i,
  /^where\s+can\s+i\s+buy\s+/i,
  /^best\s+places?\s+to\s+buy\s+/i,
  /^buy\s+/i,
];

/** The bare topic a transactional keyword is about, for slotting into {k}. */
function coreTopic(keyword: string, intent: KeywordIntent): string {
  if (intent !== "transactional") return keyword;
  let k = keyword.trim();
  for (const re of BUY_PREFIX_STRIP) k = k.replace(re, "");
  k = k.trim();
  // Never let stripping produce an empty {k} — fall back to the original.
  return k.length > 0 ? k : keyword;
}

// ─── Filtering ──────────────────────────────────────────────────────────────

// Small and intentionally non-exhaustive — this is a coarse guard against the
// obviously-wrong candidates (a competitor marketplace, a raw domain), not a
// content-moderation list. Extend it if a bad target class shows up in
// practice.
const NAVIGATIONAL_STOPWORDS = [
  "amazon", "ebay", "walmart", "reddit", "youtube", "wikipedia",
  "craigslist", "facebook", "instagram", "tiktok", "pinterest",
];
const DOMAIN_LIKE = /\.[a-z]{2,4}\b/;

/** True when a keyword is navigational/brand-competitor noise, not a real target. */
export function isNavigationalKeyword(keyword: string): boolean {
  const k = normalizeTargetKeyword(keyword);
  return NAVIGATIONAL_STOPWORDS.some((w) => k.includes(w)) || DOMAIN_LIKE.test(k);
}

/**
 * True when a keyword already names one of the given cities — its own or any
 * other blog's. Pairing such a keyword with a city again would either repeat
 * it ("peptides montreal" on the Montreal blog -> "... in Montreal") or
 * contradict it ("peptides toronto" on the Montreal blog -> nonsensical).
 * `knownCities` should be the distinct set of cities actually assigned across
 * the network (see keyword-target-actions.ts) — there is no external
 * gazetteer here, by design (see lib/content/brand.ts for why).
 */
export function keywordNamesAnyCity(
  keyword: string,
  knownCities: string[],
): boolean {
  const k = normalizeTargetKeyword(keyword);
  return knownCities.some((city) => {
    const c = normalizeTargetKeyword(city);
    return c.length > 0 && k.includes(c);
  });
}

/** True when a keyword survives both filters and is a sane target candidate. */
export function isEligibleKeywordTarget(
  keyword: string,
  knownCities: string[],
): boolean {
  return !isNavigationalKeyword(keyword) && !keywordNamesAnyCity(keyword, knownCities);
}
