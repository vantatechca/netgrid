// Post language mode + niche-based language defaults.
//
// Isomorphic (no imports) so the client onboarding form and the server-side
// generation path share one definition of the niche language rules.
//
// A client's `languageMode` is the explicit operator control:
//   "en"    → every post English
//   "fr"    → every post French
//   "en_fr" → posts alternate English / French (strict, per blog)
//   null    → not set; fall back to the legacy derived rules below
// When set, it overrides the hardcoded niche/TLD locks (operator owns
// compliance).

export type LanguageMode = "en" | "fr" | "en_fr";

/**
 * Niche keys locked to French (Quebec market) under the LEGACY derived rules —
 * used only when a client has no explicit languageMode set. gambling family.
 */
export const FRENCH_ONLY_NICHE_KEYS = new Set(["gambling", "online_casino"]);

/**
 * Niche keys that mix English + French per post under the LEGACY derived rules
 * (the "en_fr" behaviour), even on a .com domain.
 */
export const MIXED_LANGUAGE_NICHE_KEYS = new Set(["real_estate"]);

/** Normalize a raw niche string to its key shape (matches normalizeNicheKey). */
function normalizeNiche(niche: string | null | undefined): string {
  return (niche || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Best-effort default language mode for a niche — mirrors the legacy derived
 * rules so a client that has never set an explicit mode shows checkboxes that
 * match its current behaviour (and saving them preserves it).
 */
export function defaultLanguageModeForNiche(
  niche: string | null | undefined,
): LanguageMode {
  const key = normalizeNiche(niche);
  if (FRENCH_ONLY_NICHE_KEYS.has(key)) return "fr";
  if (MIXED_LANGUAGE_NICHE_KEYS.has(key)) return "en_fr";
  return "en";
}

/** Two checkboxes (English, French) → a language mode. Null when neither is on. */
export function languageModeFromToggles(
  en: boolean,
  fr: boolean,
): LanguageMode | null {
  if (en && fr) return "en_fr";
  if (fr) return "fr";
  if (en) return "en";
  return null;
}

/** A language mode → the two checkbox states. Unset defaults to English-only. */
export function togglesFromLanguageMode(
  mode: LanguageMode | string | null | undefined,
): { en: boolean; fr: boolean } {
  if (mode === "fr") return { en: false, fr: true };
  if (mode === "en_fr") return { en: true, fr: true };
  return { en: true, fr: false };
}
