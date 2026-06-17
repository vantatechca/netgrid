import type { CompoundCanonEntry, SubNicheId } from "../types";

/**
 * Compound canon per sub-niche. `primary` is the focused pool (each blog
 * draws 2 from here for primary_compounds); `adjacent` widens the secondary
 * draw to topically-adjacent compounds without breaking sub-niche identity.
 *
 * "broad" mode means the algorithm pulls from the union of all canons; used
 * for methodology / news / stack-design where content is multi-compound by
 * nature.
 */
export const COMPOUND_CANON: Record<SubNicheId, CompoundCanonEntry> = {
  1: {
    subNiche: 1,
    mode: "primary",
    primary: ["BPC-157", "TB-500", "GHK-Cu", "IGF-1 LR3", "Pentadeca Arginate"],
    adjacent: ["KPV", "AOD-9604", "Thymosin Alpha-1"],
  },
  2: {
    subNiche: 2,
    mode: "primary",
    primary: ["Semax", "Selank", "Cerebrolysin", "Dihexa", "P21"],
    adjacent: ["NAD+", "MOTS-c", "Pinealon"],
  },
  3: {
    subNiche: 3,
    mode: "primary",
    primary: ["Epitalon", "GHK-Cu", "NAD+", "MOTS-c", "Thymalin"],
    adjacent: ["Pinealon", "Cortagen", "Vesugen"],
  },
  4: {
    subNiche: 4,
    mode: "primary",
    primary: ["Semaglutide", "Tirzepatide", "AOD-9604", "Retatrutide", "Tesamorelin"],
    adjacent: ["MOTS-c", "CJC-1295", "Hexarelin"],
  },
  5: {
    subNiche: 5,
    mode: "primary",
    primary: ["Ipamorelin", "CJC-1295", "IGF-1 LR3", "Tesamorelin", "Hexarelin"],
    adjacent: ["BPC-157", "MK-677", "GHRP-6"],
  },
  6: {
    subNiche: 6,
    mode: "primary",
    primary: ["GHK-Cu", "Melanotan II", "PT-141", "Argireline"],
    adjacent: ["BPC-157", "TB-500", "Matrixyl"],
  },
  7: {
    subNiche: 7,
    mode: "primary",
    primary: ["Kisspeptin", "Oxytocin", "Semaglutide", "BPC-157", "GHK-Cu"],
    adjacent: ["Tirzepatide", "PT-141", "Pentadeca Arginate"],
  },
  8: { subNiche: 8, mode: "broad", primary: [], adjacent: ["any"] },
  9: { subNiche: 9, mode: "broad", primary: [], adjacent: ["any_common"] },
  10: { subNiche: 10, mode: "broad", primary: [], adjacent: ["news_driven_lean_glp1"] },
  11: {
    subNiche: 11,
    mode: "primary",
    primary: ["BPC-157", "GHK-Cu", "Ipamorelin", "Semaglutide"],
    adjacent: ["any_common"],
  },
  12: { subNiche: 12, mode: "broad", primary: [], adjacent: ["any", "6_compound_stacks"] },
  13: {
    subNiche: 13,
    mode: "primary",
    primary: ["DSIP", "Selank", "Tesamorelin", "Epitalon"],
    adjacent: ["NAD+"],
  },

  // ─── Non-peptide niches: subject/topic canons ─────────────────────────────
  // For non-peptide blogs, "compounds" are repurposed as topic terms — the
  // canonical things the blog talks about. Two get picked as primary
  // subjects, four as secondary.

  // 14 - Reputation sites
  14: {
    subNiche: 14,
    mode: "primary",
    primary: ["Trustpilot", "Yelp", "Google Reviews", "BBB", "G2"],
    adjacent: ["review responses", "reputation management", "fake reviews"],
  },

  // 15 - Gambling
    // 15 - Gambling (sports betting + online casino — one combined niche)
  15: {
    subNiche: 15,
    mode: "primary",
    primary: [
      "NFL betting", "NBA betting", "MLB betting", "soccer betting", "tennis betting",
      "online slots", "blackjack", "roulette", "live dealer", "casino bonuses",
    ],
    adjacent: [
      "closing line value", "expected value", "bankroll management", "responsible gambling",
      "wagering requirements", "RTP percentages", "house edge", "baccarat", "video poker",
    ],
  },

  // 16 - Apps & software
  16: {
    subNiche: 16,
    mode: "primary",
    primary: ["productivity apps", "fitness apps", "finance apps", "messaging apps", "AI apps"],
    adjacent: ["iOS apps", "Android apps", "subscription pricing", "app permissions"],
  },

  // 17 - Creator platforms
  17: {
    subNiche: 17,
    mode: "primary",
    primary: ["OnlyFans", "Fansly", "Patreon", "Substack", "Twitch"],
    adjacent: ["creator monetisation", "subscriber retention", "platform fees"],
  },

  // 18 - Ecom nails
  18: {
    subNiche: 18,
    mode: "primary",
    primary: ["gel polish", "builder gel", "chrome powder", "press-on nails", "nail art"],
    adjacent: ["cuticle care", "nail health", "nail trends"],
  },

  // 19 - Soccer jerseys
  19: {
    subNiche: 19,
    mode: "primary",
    primary: ["authentic jerseys", "replica jerseys", "retro kits", "home kits", "away kits"],
    adjacent: ["jersey sizing", "authentication", "jersey collecting"],
  },

  // 20 - Payment processing
  20: {
    subNiche: 20,
    mode: "primary",
    primary: ["Stripe", "Square", "PayPal", "Adyen", "Authorize.net"],
    adjacent: ["interchange fees", "PCI compliance", "chargeback management"],
  },

  // 21 - Web dev
  21: {
    subNiche: 21,
    mode: "primary",
    primary: ["React", "Next.js", "Vue", "Svelte", "TypeScript"],
    adjacent: ["web performance", "SSR", "edge computing", "Node.js"],
  },

  // 22 - App dev
  22: {
    subNiche: 22,
    mode: "primary",
    primary: ["React Native", "Flutter", "Swift", "Kotlin", "Expo"],
    adjacent: ["cross-platform", "iOS development", "Android development", "mobile UX"],
  },

  // 23 - Construction
  23: {
    subNiche: 23,
    mode: "primary",
    primary: ["commercial construction", "bidding process", "general contracting", "subcontracting", "permits"],
    adjacent: ["OSHA compliance", "project management", "prevailing wage", "cash flow"],
  },

  // 24 - Loans
  24: {
    subNiche: 24,
    mode: "primary",
    primary: ["personal loans", "mortgages", "auto loans", "student loans", "debt consolidation"],
    adjacent: ["APR", "credit score", "loan qualification", "predatory lending"],
  },

  // 25 - Universal (any unregistered niche)
  //
  // Empty primary canon — for niches not in the registry we don't have
  // hand-curated subject terms. The blog's actual niche label (e.g.
  // "gym marketing") gets passed through the composer separately as
  // nicheLabel and substituted into the {sub_niche} placeholder so
  // Claude still receives accurate topical context.
  25: {
    subNiche: 25,
    mode: "broad",
    primary: [],
    adjacent: ["any"],
  },

  // 26 - Gym Franchise & Memberships
  // Shared canon for both the openings/launch vertical and the long-term
  // subscription vertical. Topics span franchise operations, membership
  // economics, and member experience.
  26: {
    subNiche: 26,
    mode: "primary",
    primary: ["franchise openings", "membership pricing", "member retention", "gym equipment", "personal training"],
    adjacent: ["franchise fees", "lease negotiation", "class programming", "member acquisition", "churn reduction"],
  },

  // 27 - Roofing & Roof Repair
  // Materials, repair vs replacement decisions, insurance claims, RBQ
  // licensing, regional climate damage patterns.
  27: {
    subNiche: 27,
    mode: "primary",
    primary: ["asphalt shingles", "metal roofing", "tile roofing", "flat roof", "ice damming"],
    adjacent: ["roof inspection", "hail damage", "insurance claim", "RBQ licensing", "ventilation"],
  },

  // 28 - Tax Law & IRS Representation
  // Audit defense, debt settlement, compliance — both US (IRS) and
  // Quebec (Revenu Québec, ARC) angles. Vertical config locks the
  // byline to a research role + appends disclaimers.
  28: {
    subNiche: 28,
    mode: "primary",
    primary: ["tax audit", "offer in compromise", "installment agreement", "Revenu Québec assessment", "tax court"],
    adjacent: ["FBAR", "innocent spouse relief", "wage garnishment", "credits and deductions", "CRA review"],
  },

  // 29 - Pest Control & Extermination
  // Residential and commercial pest control. Includes named species,
  // PMRA / EPA registered treatments, seasonal patterns.
  29: {
    subNiche: 29,
    mode: "primary",
    primary: ["bed bugs", "cockroaches", "termites", "rodents", "ants"],
    adjacent: ["wasps and hornets", "ticks", "spiders", "integrated pest management", "PMRA registry"],
  },

  // 30 - Charity & Nonprofit Operations
  // Fundraising, governance, donor stewardship, news-cycle advocacy.
  // Two parallel editorial tracks at the vertical level.
  30: {
    subNiche: 30,
    mode: "primary",
    primary: ["fundraising campaigns", "donor retention", "grant writing", "501(c)(3) compliance", "T3010 filings"],
    adjacent: ["Giving Tuesday", "capital campaigns", "board governance", "volunteer management", "advocacy"],
  },

  // 31 - Gym Subscription / Long-term Membership
  // Vertical #3 only. Distinct from sub-niche 26 (openings) — this is
  // for ongoing membership content: which chain is cheapest, contract
  // gotchas, comparison content, cancellation walkthroughs.
  31: {
    subNiche: 31,
    mode: "primary",
    primary: ["membership pricing", "contract terms", "cancellation policy", "annual fees", "auto-renewal"],
    adjacent: ["personal training cost", "class pass models", "boutique vs big-box", "freeze and pause options", "couple and family plans"],
  },
  32: {
    subNiche: 32,
    mode: "primary",
    primary: ["online slots", "blackjack", "roulette", "live dealer", "casino bonuses"],
    adjacent: ["video poker", "baccarat", "wagering requirements", "RTP percentages", "house edge", "responsible gambling"],
  },
  33: {
    subNiche: 33,
    mode: "primary",
    primary: ["home buying", "mortgages", "rental market", "investment property", "market reports"],
    adjacent: ["closing costs", "cap rate", "1031 exchange", "commercial leasing", "neighbourhood comps", "agent commissions"],
  },
};

/**
 * Flattened universe of every named compound across all canons. Used when a
 * "broad" sub-niche needs to draw from the union.
 */
export const ALL_COMPOUNDS: readonly string[] = (() => {
  const set = new Set<string>();
  for (const id of Object.keys(COMPOUND_CANON) as unknown as SubNicheId[]) {
    const entry = COMPOUND_CANON[id];
    entry.primary.forEach((c) => set.add(c));
    entry.adjacent.forEach((c) => {
      // Skip directive tokens
      if (c === "any" || c === "any_common" || c === "news_driven_lean_glp1" || c === "6_compound_stacks") {
        return;
      }
      set.add(c);
    });
  }
  return Array.from(set);
})();

/** Sub-niches that lean toward GLP-1 news (for sub-niche 10's "news driven" mode). */
export const GLP1_COMPOUNDS: readonly string[] = [
  "Semaglutide",
  "Tirzepatide",
  "Retatrutide",
  "AOD-9604",
  "Tesamorelin",
  "MOTS-c",
];
