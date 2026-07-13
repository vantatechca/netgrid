// Peptides programmatic location pages — title + keyword templating.
//
// Each page targets a long-tail "[buy] [compound] [location]" query. Titles are
// varied deterministically per (compound, location) from a small template set,
// so a client's hundreds of location pages don't share one byte-identical title
// pattern (a footprint signal) while staying stable across re-runs.
//
// Dependency-free so it's usable both server-side (generation) and for a UI
// preview of the matrix.

/** Title templates. {c} = compound, {l} = location. */
const TITLE_TEMPLATES = [
  "Where to Buy {c} in {l}: Pricing & Availability",
  "{c} in {l} — Cost, Sourcing & What to Know",
  "Is {c} Available in {l}? A Practical Buyer's Guide",
  "{c} for Sale in {l}: Quality, Price & Delivery",
  "Buying {c} in {l}: Availability, Dosage & Cost",
  "{c} in {l}: How to Source It and What It Costs",
];

/** Stable non-negative hash of a string (djb2). Deterministic — no RNG. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Title-case a raw location/compound for display in the title. */
function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The query-targeted title for one page. `dosage` optional ('' = none). */
export function buildLocationTitle(
  compound: string,
  location: string,
  dosage?: string,
): string {
  const d = (dosage ?? "").trim();
  const c = d ? `${titleCase(compound)} ${d}` : titleCase(compound);
  const l = titleCase(location);
  const template =
    TITLE_TEMPLATES[hash(`${compound}|${d}|${location}`) % TITLE_TEMPLATES.length];
  return template.replace(/\{c\}/g, c).replace(/\{l\}/g, l);
}

/** Target keyword variants (qualifier folded into keywords). `dosage` optional. */
export function buildLocationKeywords(
  compound: string,
  location: string,
  dosage?: string,
): string[] {
  const d = (dosage ?? "").trim().toLowerCase();
  const c = d ? `${compound.trim().toLowerCase()} ${d}` : compound.trim().toLowerCase();
  const l = location.trim().toLowerCase();
  return [
    `${c} ${l}`,
    `buy ${c} ${l}`,
    `${c} price ${l}`,
    `${c} for sale ${l}`,
    `where to buy ${c} ${l}`,
  ];
}

/** Split a global dosage field (newlines and/or commas) into clean tokens. */
export function parseDosages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of raw.split(/[\n,]+/)) {
    const d = tok.trim();
    if (!d) continue;
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/**
 * Split the free-text location field into clean entries — ONE PER LINE only.
 * Commas are kept (a location is often "City, Province"), so we split on
 * newlines, not commas. Trims, drops blanks, de-dupes case-insensitively.
 */
export function parseLocations(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const loc = line.trim();
    if (!loc) continue;
    const key = loc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}
