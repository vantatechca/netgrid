// Domain → suggested brand name, for pre-filling the admin form only.
//
// Never authoritative — see docs/local-keyword-content-plan.md §3. A domain
// like "pizzeriacrosta.ca" carries no city at all (its city is Brossard), and
// "montrealpeptides.com" might actually be branded "MTL Peptides". This module
// only proposes a starting point in the blog form; the operator always
// confirms or overrides it before anything reaches blogs.brand_name.
//
// Deliberately small and self-contained — a short list of common business/
// niche words is enough to split a concatenated label like "montrealpeptides"
// into "Montreal Peptides" when one is recognized, and title-casing the whole
// label is a reasonable fallback when none is. This is NOT a city gazetteer:
// city names are far too numerous to hardcode reliably, which is exactly why
// blogs.city is always operator-assigned and never derived here.

const NICHE_WORDS = [
  "peptides", "peptide",
  "roofing", "roofers", "roofer",
  "fitness", "gym",
  "dentistry", "dentist", "dental",
  "pizzeria", "pizza",
  "restaurant", "catering", "bakery", "cafe",
  "lending", "loans", "loan",
  "attorney", "lawyers", "lawyer", "legal",
  "taxes", "tax",
  "extermination", "exterminators", "exterminator", "pest",
  "realestate", "realty", "properties", "homes",
  "casino", "gaming", "betting", "bets",
  "salon", "nails", "spa",
  "construction", "contractors", "contractor",
  "plumbing", "plumbers", "plumber",
  "electricians", "electrician", "electric",
  "autobody", "motors", "auto",
  "wellness", "clinic", "supplements", "vitamins", "health",
  "jerseys", "jersey", "apparel",
  // Longest-first within each group so e.g. "roofers" matches before the
  // shorter "roofer" would otherwise cut it mid-word.
].sort((a, b) => b.length - a.length);

function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Strip protocol, path, "www.", and the TLD suffix, leaving the bare label. */
function baseLabel(domain: string): string {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
  const parts = host.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : host;
}

/**
 * Best-effort brand-name suggestion from a domain, for pre-filling the admin
 * form only (see module comment). Splits on hyphens/underscores when present;
 * otherwise scans for one recognized niche word inside a concatenated label
 * ("montrealpeptides" -> "Montreal Peptides"). Falls back to title-casing the
 * whole label when nothing is recognized. Returns null for an empty domain.
 */
export function deriveBrandName(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const base = baseLabel(domain);
  if (!base) return null;

  if (/[-_]/.test(base)) {
    return base.split(/[-_]+/).filter(Boolean).map(titleCase).join(" ");
  }

  for (const word of NICHE_WORDS) {
    const idx = base.indexOf(word);
    if (idx === -1) continue;
    const before = base.slice(0, idx);
    const after = base.slice(idx + word.length);
    return [before, word, after].filter(Boolean).map(titleCase).join(" ");
  }

  return titleCase(base);
}
