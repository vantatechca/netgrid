import type { CitationStyleId, SchemaId, SubNicheId, TagSetId, VoiceId } from "../types";

/**
 * Cross-niche registry. Each niche (matching `clients.niche` after
 * normalisation via normalizeNicheKey) defines:
 *
 *   - Which sub-niches its blogs draw from
 *   - Which voices are eligible (the peptide voice library is mostly
 *     peptide-flavoured; cross-niche voices V78-V127 cover other niches)
 *   - Whether compliance phrases apply (peptides yes, gambling yes for
 *     responsible-gambling disclaimers, most others no)
 *   - Whether a subject canon applies (peptides → compounds; web_dev →
 *     frameworks; gambling → sports; etc.)
 *   - Tag-set, schema, and citation-style bias defaults for the niche
 *
 * The peptide entry keeps the existing 13 sub-niches and 77 voices fully
 * intact. Other niches use the smaller cross-niche subset.
 */

export interface NicheConfig {
  /** Normalised key matching content-generator.normalizeNicheKey() output. */
  key: string;
  /** Display name. */
  name: string;
  /** Sub-niche IDs available to this niche. */
  subNicheIds: SubNicheId[];
  /** Voice IDs eligible for this niche. */
  voiceIds: VoiceId[];
  /** When true, the assignment algorithm picks 2-3 compliance phrases. */
  useCompliancePhrases: boolean;
  /**
   * Compliance phrase IDs that fit this niche specifically. Empty array
   * → no compliance assigned. Currently only peptides + gambling use
   * compliance enforcement.
   */
  compliancePhraseIds: number[];
  /** When true, primaryCompounds/secondaryCompounds get populated. */
  useSubjectCanon: boolean;
  /** Default placement weights override (peptides leans bottom; news leans top). */
  placementHint?: "TOP" | "BOTTOM" | "INLINE";
  /** Optional notes for admin display. */
  description: string;
}

// Cross-niche voice pool (V78-V127) — voices whose personas are generic
// enough to handle multiple niches. Defined in voices.ts. Expanded from 15
// to 50 so the ~20 non-peptide niches don't all draw from the same small
// persona set (a network-level footprint when scaled to hundreds of sites).
const CROSS_NICHE_VOICE_POOL: VoiceId[] = Array.from({ length: 50 }, (_, i) => i + 78);

// Peptide voice pool (V1-V77) — the original 77 peptide-flavoured voices.
const PEPTIDE_VOICE_POOL: VoiceId[] = Array.from({ length: 77 }, (_, i) => i + 1);

export const NICHES: Record<string, NicheConfig> = {
  peptides: {
    key: "peptides",
    name: "Peptides & Performance",
    subNicheIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    voiceIds: PEPTIDE_VOICE_POOL,
    useCompliancePhrases: true,
    compliancePhraseIds: Array.from({ length: 40 }, (_, i) => i + 1),
    useSubjectCanon: true,
    description: "Peptide research, performance, recovery — original architecture target.",
  },

  reputation_sites: {
    key: "reputation_sites",
    name: "Reputation Sites & Reviews",
    subNicheIds: [14, 34, 35, 36],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Trustpilot, Yelp, Google Reviews, BBB — review platforms and reputation management.",
  },

  gambling: {
    key: "gambling",
    name: "Sports Betting & Gambling",
    subNicheIds: [15, 37, 38, 39],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: true,
    // Gambling-specific phrases live in compliance-phrases.ts at IDs 41-44.
    compliancePhraseIds: [41, 42, 43, 44],
    useSubjectCanon: true,
    placementHint: "BOTTOM",
    description: "Sports betting analysis, betting strategy, responsible gambling.",
  },

  apps_marketing: {
    key: "apps_marketing",
    name: "Apps & Software Reviews",
    subNicheIds: [16, 40, 41, 42],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Mobile app reviews, productivity software, app comparisons.",
  },

  exclusive_models: {
    key: "exclusive_models",
    name: "Creator Platforms",
    subNicheIds: [17, 43, 44, 45],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Creator economy, monetisation, content marketing for creators.",
  },

  ecom_nails: {
    key: "ecom_nails",
    name: "Nails & Beauty E-commerce",
    subNicheIds: [18, 46, 47, 48],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Nail art, gel polish, beauty product reviews.",
  },

  soccer_jersey: {
    key: "soccer_jersey",
    name: "Soccer Jerseys & Fan Merch",
    subNicheIds: [19, 49, 50, 51],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Authentic vs replica jerseys, kit collecting, fan merchandise.",
  },

  payment_processing: {
    key: "payment_processing",
    name: "Payment Processing & Fintech",
    subNicheIds: [20, 52, 53, 54],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Payment gateways, transaction fees, PCI compliance, merchant accounts.",
  },

  web_dev: {
    key: "web_dev",
    name: "Web Development",
    subNicheIds: [21, 55, 56, 57],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Frontend/backend frameworks, web performance, modern stack choices.",
  },

  app_dev: {
    key: "app_dev",
    name: "App Development",
    subNicheIds: [22, 58, 59, 60],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "iOS / Android / cross-platform mobile development.",
  },

  construction: {
    key: "construction",
    name: "Construction & B2B Services",
    subNicheIds: [23, 61, 62, 63],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Commercial construction, bidding, project management, contractor business.",
  },

  loans: {
    key: "loans",
    name: "Loans & Personal Finance",
    subNicheIds: [24, 64, 65, 66],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description: "Personal loans, mortgages, credit, debt consolidation.",
  },

  gym_franchise: {
    key: "gym_franchise",
    name: "Gym Franchise Openings & Launches",
    subNicheIds: [26, 67, 68, 69],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    placementHint: "TOP",
    description:
      "Vertical #2 only — short-lifespan content tied to new gym launches: opening dates, ribbon-cuttings, founder backgrounds, location announcements, opening promotions. Distinct from the long-term gym_subscription niche which handles ongoing membership comparison content.",
  },

  gym_subscription: {
    key: "gym_subscription",
    name: "Gym Memberships & Subscriptions",
    subNicheIds: [31, 82, 83, 84],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description:
      "Vertical #3 only — evergreen membership comparison content. Chain-vs-chain pricing, contract gotchas, cancellation walkthroughs, boutique vs big-box analysis. Defensible long-term content; reads more like consumer-advisor than local news. Distinct from gym_franchise which covers opening-day stories.",
  },

  roofing: {
    key: "roofing",
    name: "Roofing & Roof Repair",
    subNicheIds: [27, 70, 71, 72],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description:
      "Roofing contractor content — material comparisons (asphalt/metal/tile), insurance claims, regional climate factors, RBQ licensing checks. More specific than generic construction; gives the prompt richer roofing-vocabulary context.",
  },

  tax_lawyer: {
    key: "tax_lawyer",
    name: "Tax Law & IRS Representation",
    subNicheIds: [28, 73, 74, 75],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    // Tax law has mandatory disclaimers + bar-review posture; track
    // those at the vertical-config level (disclaimers field) rather
    // than wiring compliance phrases that were designed for peptides.
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description:
      "Tax law, IRS / Revenu Québec representation, audit defense. Highest compliance posture in the network — vertical config locks the author byline to 'Recherchiste en information juridique' and appends mandatory disclaimers.",
  },

  pest_extermination: {
    key: "pest_extermination",
    name: "Pest Control & Extermination",
    subNicheIds: [29, 76, 77, 78],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description:
      "Residential and commercial pest control — PMRA-registered products, seasonal pest cycles, DIY vs professional treatment, identification guides. Pest-specific terminology + label-rate compliance.",
  },

  charity: {
    key: "charity",
    name: "Charity & Nonprofit Operations",
    subNicheIds: [30, 79, 80, 81],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    placementHint: "BOTTOM",
    description:
      "Charity operations, fundraising, donor stewardship, news-cycle advocacy. Two parallel editorial tracks (charity-branded news + independent advocacy w/ CASL disclosure) are configured at the vertical level.",
  },

  online_casino: {
    key: "online_casino",
    name: "Online Casino & Casino Games",
    subNicheIds: [32, 85, 86, 87],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    // Casino content carries the same responsible-gambling posture as the
    // existing sports-betting `gambling` niche — reuse the same compliance
    // phrase IDs (41-44) so the disclaimers stay consistent across the
    // gambling family.
    useCompliancePhrases: true,
    compliancePhraseIds: [41, 42, 43, 44],
    useSubjectCanon: true,
    placementHint: "BOTTOM",
    description:
      "Online casino content — slots, table games (blackjack/roulette/baccarat), poker, live dealer, casino welcome bonuses, wagering requirements, RTP analysis. Distinct from the sports-betting `gambling` niche; reuses its responsible-gambling disclaimer set.",
  },

  real_estate: {
    key: "real_estate",
    name: "Real Estate & Property",
    subNicheIds: [33, 88, 89, 90],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: true,
    description:
      "Residential and commercial real estate — home buying / selling, mortgages, rental markets, investment property, agent / brokerage operations, neighbourhood market reports. Concrete pricing + market-data vocabulary; distinct from generic `loans` (which covers personal finance broadly).",
  },

  // Universal fallback — used when a client's niche string doesn't match
  // any other registered key. The blog's actual niche label (e.g.
  // "gym marketing", "real estate", "dental practice") gets passed
  // through at compose time so the prompt and image generator still
  // produce topically accurate content even without a hand-curated
  // niche-specific subject canon or compliance set.
  universal: {
    key: "universal",
    name: "Universal (any niche)",
    subNicheIds: [25],
    voiceIds: CROSS_NICHE_VOICE_POOL,
    useCompliancePhrases: false,
    compliancePhraseIds: [],
    useSubjectCanon: false,
    description:
      "Catches any client niche not explicitly registered. Uses generic voices and the blog's actual niche string for topical context.",
  },
};

export const NICHE_KEYS = Object.keys(NICHES);
export const PEPTIDES_NICHE_KEY = "peptides";
export const UNIVERSAL_NICHE_KEY = "universal";

/** Returns the config for a niche key, or null if not registered. */
export function nicheConfig(key: string | null | undefined): NicheConfig | null {
  if (!key) return null;
  return NICHES[key] ?? null;
}

/** True if this niche is the original peptide architecture target. */
export function isPeptidesNiche(key: string | null | undefined): boolean {
  return key === PEPTIDES_NICHE_KEY;
}
