import "server-only";
import { topActiveClientKeywords } from "@/lib/content/client-keywords";
import { resolveNicheConfig } from "@/lib/content/niche-config-db";

// Custom-prompt placeholder interpolation (see
// docs/local-keyword-content-plan.md §6). A client's custom prompt can
// reference {keyword}/{city}/{region}/{country}/{brand}/{domain} — the brief
// keeps its existing authority over topic/voice, and just gains the ability
// to pull these values from the database instead of the operator hand-typing
// them per client.

export interface PlaceholderBlogContext {
  clientId: string;
  domain: string;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  niche: string | null | undefined;
}

export interface ClaimedKeywordLike {
  keyword: string;
}

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/** True when `template` contains at least one {token}-shaped placeholder. */
export function hasPlaceholders(template: string): boolean {
  return /\{(\w+)\}/.test(template);
}

/**
 * Resolve every {token} in a custom prompt. Only ever worth calling when
 * hasPlaceholders() is true — a prompt with no tokens never pays for the
 * fallback lookups below, and is returned unchanged.
 *
 * - {keyword} is never left empty when a value exists ANYWHERE to find:
 *   claimed target -> the client's top-ranked scraped keyword (regardless of
 *   ledger status) -> the niche's first key topic -> literal, if truly
 *   nothing is available.
 * - {city}/{region}/{country} have no analogous fallback chain — a WRONG
 *   guess would be actively harmful (see lib/content/brand.ts on why city
 *   is never derived) — so they fill only when the blog actually has the
 *   value, and are left literal otherwise.
 * - {brand}/{domain} fill directly from the resolved blog values.
 * - Any other {token} (a typo) is always left literal.
 *
 * Every "left literal" case is logged — a typo or an unfillable token should
 * be visible in the output, not silently produce a malformed instruction.
 */
export async function interpolatePromptPlaceholders(
  template: string,
  blog: PlaceholderBlogContext,
  claimed: ClaimedKeywordLike | undefined,
  brandName: string | null | undefined,
): Promise<string> {
  let keyword = claimed?.keyword;
  if (!keyword) {
    const [topKeyword] = await topActiveClientKeywords(blog.clientId, 1);
    keyword = topKeyword;
  }
  if (!keyword) {
    const nicheConfig = await resolveNicheConfig(blog.niche);
    keyword = nicheConfig?.keyTopics?.[0];
  }

  const values: Record<string, string | undefined> = {
    keyword,
    city: blog.city ?? undefined,
    region: blog.region ?? undefined,
    country: blog.countryCode ?? undefined,
    brand: brandName ?? undefined,
    domain: blog.domain,
  };

  return template.replace(PLACEHOLDER_PATTERN, (match, token: string) => {
    if (!(token in values)) {
      console.warn(`[local-targeting] unrecognized prompt placeholder ${match} left as-is`);
      return match;
    }
    const value = values[token];
    if (!value) {
      console.warn(`[local-targeting] no value available for ${match} — left as-is`);
      return match;
    }
    return value;
  });
}
