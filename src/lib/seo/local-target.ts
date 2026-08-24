/**
 * Local keyword-target SEO injection — companion to reddit.ts.
 *
 * Guarantees a local-targeted post's meta title and description contain the
 * claimed keyword + city, DETERMINISTICALLY when Claude's own output doesn't
 * already carry them (exact-match SEO value matters more than freeform copy
 * on this specific surface), and left ALONE when it does — so a compliant
 * model output is never fought or duplicated.
 *
 * Idempotent, same contract reddit.ts's hasReddit()/appendRedditTo* honor:
 * re-running on an already-injected value is a no-op for this layer.
 * Callers run this injector BEFORE reddit.ts's — see
 * content-generator.ts's normalizeMetaTitle/normalizeMetaDescription — which
 * is what actually produces "[keyword] in [city] ... Reddit" end to end.
 *
 * See docs/local-keyword-content-plan.md §5 ("Meta title — the ordering
 * constraint") for why element order matters: appendRedditToTitle truncates
 * from the right, so keyword+city must lead and brand trails as the element
 * that yields first when the pixel budget is tight.
 */

export interface LocalTargetMetaContext {
  keyword: string;
  city: string;
  brandName?: string | null;
}

const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on",
  "or", "so", "the", "to", "up", "yet", "vs",
]);

/** Title-case that keeps minor words lowercase mid-phrase (never first/last). */
export function seoTitleCase(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && i < words.length - 1 && MINOR_WORDS.has(lower)) return lower;
      return lower.length ? lower[0].toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

/** True when `text` already mentions both the target's keyword and city. */
export function hasLocalTarget(
  text: string | null | undefined,
  target: LocalTargetMetaContext,
): boolean {
  const t = (text ?? "").toLowerCase();
  return (
    t.includes(target.keyword.trim().toLowerCase()) &&
    t.includes(target.city.trim().toLowerCase())
  );
}

/** "Where to Buy Peptides in Montreal[ | Brand]" — the deterministic title lead. */
function titleLead(target: LocalTargetMetaContext): string {
  const lead = `${seoTitleCase(target.keyword)} in ${seoTitleCase(target.city)}`;
  return target.brandName ? `${lead} | ${target.brandName}` : lead;
}

/** "Where to buy peptides in Montreal" — a sentence-case lead clause. */
function descriptionLead(target: LocalTargetMetaContext): string {
  const lead = `${target.keyword.trim()} in ${target.city.trim()}`;
  return lead.length ? lead[0].toUpperCase() + lead.slice(1) : lead;
}

/**
 * Guarantee the meta title contains the target's keyword + city, replacing
 * `base` with the deterministic construction only when it doesn't already —
 * so a compliant Claude output is kept as-is. Call BEFORE appendRedditToTitle
 * so keyword+city lead the pixel-truncation-from-the-right (see module doc).
 */
export function ensureLocalTargetTitle(
  base: string,
  target: LocalTargetMetaContext,
): string {
  if (hasLocalTarget(base, target)) return base;
  return titleLead(target);
}

/**
 * Guarantee the meta description LEADS with the target's keyword + city,
 * prepending a lead clause only when it doesn't already carry them. Call
 * BEFORE appendRedditToDescription so the lead clause survives the
 * pixel-truncation-from-the-right even if the rest gets cut.
 */
export function ensureLocalTargetDescription(
  base: string,
  target: LocalTargetMetaContext,
): string {
  if (hasLocalTarget(base, target)) return base;
  const lead = descriptionLead(target);
  return base.length > 0 ? `${lead}. ${base}` : lead;
}
