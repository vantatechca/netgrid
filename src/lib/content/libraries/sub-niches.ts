import type { SubNiche, SubNicheId } from "../types";

/**
 * 13 sub-niches with target distribution across 2000 peptide blogs.
 * Distribution sums to exactly 2000 (240+160+240+280+200+140+160+100+100+100+140+100+40).
 *
 * `thinCanon` flags sub-niches where the compound canon is small enough that
 * primary+secondary alone won't drive Hamming distance — uniqueness must come
 * from voice / skeleton / cadence / quirks instead.
 */
export const SUB_NICHES: Record<SubNicheId, SubNiche> = {
  1: { id: 1, key: "recovery_injury", name: "Recovery & injury", targetPct: 12, targetBlogs: 240 },
  2: { id: 2, key: "cognitive_nootropic", name: "Cognitive / nootropic", targetPct: 8, targetBlogs: 160 },
  3: { id: 3, key: "anti_aging_longevity", name: "Anti-aging / longevity", targetPct: 12, targetBlogs: 240 },
  4: { id: 4, key: "weight_loss_glp1", name: "Weight loss / metabolic (GLP-1)", targetPct: 14, targetBlogs: 280, defaultStrictness: "strict" },
  5: { id: 5, key: "performance_muscle", name: "Performance / muscle", targetPct: 10, targetBlogs: 200 },
  6: { id: 6, key: "aesthetic_skin_hair", name: "Aesthetic / skin / hair", targetPct: 7, targetBlogs: 140, thinCanon: true },
  7: { id: 7, key: "female_specific", name: "Female-specific", targetPct: 8, targetBlogs: 160 },
  8: { id: 8, key: "research_methodology", name: "Research methodology", targetPct: 5, targetBlogs: 100 },
  9: { id: 9, key: "reconstitution_technical", name: "Reconstitution / technical", targetPct: 5, targetBlogs: 100 },
  10: { id: 10, key: "news_regulatory", name: "News / regulatory", targetPct: 5, targetBlogs: 100, defaultStrictness: "strict" },
  11: { id: 11, key: "beginner_education", name: "Beginner education", targetPct: 7, targetBlogs: 140 },
  12: { id: 12, key: "stack_design", name: "Stack design", targetPct: 5, targetBlogs: 100 },
  13: { id: 13, key: "sleep_circadian", name: "Sleep / circadian", targetPct: 2, targetBlogs: 40, thinCanon: true },

  // ─── Non-peptide niches (one sub-niche per niche) ─────────────────────────
  // Targets are 0% — these aren't part of the 2000-blog peptide distribution.
  14: { id: 14, key: "reputation_sites_general", name: "Reputation & Reviews", targetPct: 0, targetBlogs: 0 },
  15: { id: 15, key: "gambling_general", name: "Sports Betting & Gambling", targetPct: 0, targetBlogs: 0 },
  16: { id: 16, key: "apps_marketing_general", name: "Apps & Software", targetPct: 0, targetBlogs: 0 },
  17: { id: 17, key: "creator_platforms_general", name: "Creator Platforms", targetPct: 0, targetBlogs: 0 },
  18: { id: 18, key: "ecom_nails_general", name: "Nails & Beauty", targetPct: 0, targetBlogs: 0 },
  19: { id: 19, key: "soccer_jersey_general", name: "Soccer Merchandise", targetPct: 0, targetBlogs: 0 },
  20: { id: 20, key: "payment_processing_general", name: "Payment Processing", targetPct: 0, targetBlogs: 0 },
  21: { id: 21, key: "web_dev_general", name: "Web Development", targetPct: 0, targetBlogs: 0 },
  22: { id: 22, key: "app_dev_general", name: "App Development", targetPct: 0, targetBlogs: 0 },
  23: { id: 23, key: "construction_general", name: "Construction & B2B", targetPct: 0, targetBlogs: 0 },
  24: { id: 24, key: "loans_general", name: "Loans & Personal Finance", targetPct: 0, targetBlogs: 0 },

  // ─── Universal fallback (sub-niche 25) ────────────────────────────────────
  // Used for any client niche not explicitly registered in niches.ts.
  // The actual niche label (e.g. "gym marketing", "real estate") gets
  // passed through at compose time as the {sub_niche} substitution so
  // Claude still receives the topical context.
  25: { id: 25, key: "universal_general", name: "General Content", targetPct: 0, targetBlogs: 0 },

  // ─── Gym Franchise (sub-niche 26) ─────────────────────────────────────────
  // Covers both the openings/launch vertical (#2) and the long-term
  // subscription vertical (#3). Shared sub-niche so the style profile
  // pool is consistent across both verticals.
  26: { id: 26, key: "gym_franchise_general", name: "Gym Franchise & Memberships", targetPct: 0, targetBlogs: 0 },
};

export const SUB_NICHE_IDS: SubNicheId[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  25, 26,
];
/** Peptide-only sub-niche IDs (the original distribution). */
export const PEPTIDE_SUB_NICHE_IDS: SubNicheId[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
];

export function subNicheById(id: SubNicheId): SubNiche {
  return SUB_NICHES[id];
}
