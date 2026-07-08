// Per-blog CTA targeting.
//
// Most niches use a single, manually-entered call-to-action URL set on the
// client during onboarding (clients.ctaUrl). Peptides is different: those blogs
// forward to the public domain each blog is hosted on, so their CTA is sourced
// automatically from the blog's own `domain` — per blog, no URL typed by hand —
// and the button is always shown (default label "Shop now!").
//
// Kept dependency-free (no "server-only", no content-generator import) so it is
// usable on both the server (generation + click-time redirects) and the client
// (the onboarding form, to hide the now-unused URL field for peptides).

/** The niche key whose CTA links are auto-sourced from each blog's own domain. */
export const PEPTIDES_NICHE_KEY = "peptides";

/** Default CTA button label for peptides blogs when the client sets none. */
export const PEPTIDES_DEFAULT_CTA_LABEL = "Shop now!";

/**
 * True when a raw niche string is the peptides niche. Mirrors the shape of
 * content-generator.normalizeNicheKey() for this one case (peptides has no
 * alias) — replicated here to keep this module dependency-free and isomorphic.
 */
export function isPeptidesNiche(niche: string | null | undefined): boolean {
  if (!niche) return false;
  return niche.trim().toLowerCase().replace(/[\s-]+/g, "_") === PEPTIDES_NICHE_KEY;
}

/**
 * Absolute https URL for a blog's own domain — the CTA target for peptides.
 * Tolerates a stored value with or without a scheme / trailing slash. Returns
 * null when there is no domain to link to.
 */
export function blogDomainCtaUrl(domain: string | null | undefined): string | null {
  const host = (domain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return host ? `https://${host}/` : null;
}

export interface BlogCtaInputs {
  niche: string | null | undefined;
  blogDomain: string | null | undefined;
  ctaEnabled: boolean | null | undefined;
  ctaLabel: string | null | undefined;
  ctaUrl: string | null | undefined;
  ctaPlacement: string | null | undefined;
}

/**
 * The CTA to inject into a blog's generated posts, or undefined for none.
 *
 * - Peptides: always on, pointing at the blog's own domain, labelled with the
 *   client's button text or "Shop now!". Only skipped if the blog has no domain.
 * - Every other niche: unchanged — requires the client toggle + a label + a URL.
 */
export function effectiveBlogCta(
  i: BlogCtaInputs,
): { label: string; url: string; placement: string } | undefined {
  const placement = i.ctaPlacement ?? "bottom";

  if (isPeptidesNiche(i.niche)) {
    const url = blogDomainCtaUrl(i.blogDomain);
    if (!url) return undefined;
    const label = i.ctaLabel?.trim() || PEPTIDES_DEFAULT_CTA_LABEL;
    return { label, url, placement };
  }

  const label = i.ctaLabel?.trim();
  const url = i.ctaUrl?.trim();
  if (!i.ctaEnabled || !label || !url) return undefined;
  return { label, url, placement };
}

/**
 * The CTA *destination* for a blog at click time (used by the /r redirects).
 * Peptides → the blog's own domain; every other niche → the client's
 * manually-entered CTA URL. Mirrors the redirect resolvers' existing semantics
 * for non-peptides (the URL is resolved whenever present — the button only
 * exists in published markup if a CTA was injected at generation time).
 */
export function effectiveCtaDestination(i: {
  niche: string | null | undefined;
  blogDomain: string | null | undefined;
  ctaUrl: string | null | undefined;
}): string | null {
  if (isPeptidesNiche(i.niche)) return blogDomainCtaUrl(i.blogDomain);
  return i.ctaUrl?.trim() || null;
}
