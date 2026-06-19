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

  // ─── Non-peptide niches (general sub-niche per niche; sharper angles 34-90) ─
  // Each of these is the niche's "general" sub-niche; the per-niche topical
  // sub-divisions added at IDs 34-90 sit alongside them in niches.ts.
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
  // Vertical #2 only — gym OPENINGS and franchise launches. Short-
  // lifespan pump-and-dump content tied to specific ribbon-cutting
  // events, founder backgrounds, location announcements.
  // Vertical #3 (long-term subscriptions) uses sub-niche 31 instead.
  26: { id: 26, key: "gym_franchise_general", name: "Gym Franchise Openings & Launches", targetPct: 0, targetBlogs: 0 },

  // ─── Roofing (sub-niche 27) ───────────────────────────────────────────────
  // Roofing contractor / replacement / repair content. Distinct from
  // generic "construction" — covers asphalt vs metal vs tile, insurance
  // claims, hail damage, regional climate factors.
  27: { id: 27, key: "roofing_general", name: "Roofing & Roof Repair", targetPct: 0, targetBlogs: 0 },

  // ─── Tax Law (sub-niche 28) ───────────────────────────────────────────────
  // Tax law / IRS representation / Revenu Québec content. Highest
  // compliance posture in the network — strict author byline + mandatory
  // disclaimers per the vertical config.
  28: { id: 28, key: "tax_lawyer_general", name: "Tax Law & IRS Representation", targetPct: 0, targetBlogs: 0, defaultStrictness: "strict" },

  // ─── Pest Extermination (sub-niche 29) ────────────────────────────────────
  // Residential + commercial pest control. PMRA / EPA registered
  // products, seasonal pest cycles, DIY vs professional treatment.
  29: { id: 29, key: "pest_extermination_general", name: "Pest Control & Extermination", targetPct: 0, targetBlogs: 0 },

  // ─── Charity & Nonprofit (sub-niche 30) ───────────────────────────────────
  // Charity operations, fundraising, donor stewardship, news-cycle
  // advocacy. Two parallel editorial tracks (branded + independent
  // advocacy) handled via the vertical config's contentTracks.
  30: { id: 30, key: "charity_general", name: "Charity & Nonprofit Operations", targetPct: 0, targetBlogs: 0 },

  // ─── Gym Subscription (sub-niche 31) ──────────────────────────────────────
  // Vertical #3 only — long-term, evergreen membership comparison
  // content. Chain-vs-chain pricing, contract terms, cancellation
  // policies, boutique vs big-box analysis. Lives in parallel with
  // sub-niche 26 (gym openings) so the two verticals get genuinely
  // different style profiles + topic angles.
  31: { id: 31, key: "gym_subscription_general", name: "Gym Memberships & Subscriptions", targetPct: 0, targetBlogs: 0 },
  // Casino-side complement to the sports-betting `gambling` niche (15).
  // Covers slots, table games, poker, live dealer, casino bonuses.
  32: { id: 32, key: "online_casino_general", name: "Online Casino & Casino Games", targetPct: 0, targetBlogs: 0 },
  // Brand-new vertical: residential + commercial real estate, mortgages,
  // market reports, agent / brokerage content.
  33: { id: 33, key: "real_estate_general", name: "Real Estate & Property", targetPct: 0, targetBlogs: 0 },

  // ─── Per-niche topical sub-divisions (34-90) ──────────────────────────────
  // Each registered non-peptide niche carries its original "general"
  // sub-niche (14-33) PLUS three sharper topical angles below, so blogs in
  // the same niche draw from 4 distinct {sub_niche} frames instead of one.
  // All are targetPct 0 (outside the peptide distribution); the assignment
  // algorithm spreads blogs across them with usage-balanced uniform picks.

  // reputation_sites (general: 14)
  34: { id: 34, key: "reputation_review_platforms", name: "Review Platform Comparisons", targetPct: 0, targetBlogs: 0 },
  35: { id: 35, key: "reputation_repair", name: "Online Reputation Repair", targetPct: 0, targetBlogs: 0 },
  36: { id: 36, key: "reputation_feedback_strategy", name: "Customer Feedback & Survey Strategy", targetPct: 0, targetBlogs: 0 },

  // gambling (general: 15)
  37: { id: 37, key: "gambling_strategy_bankroll", name: "Betting Strategy & Bankroll Management", targetPct: 0, targetBlogs: 0 },
  38: { id: 38, key: "gambling_odds_analysis", name: "Odds & Line-Movement Analysis", targetPct: 0, targetBlogs: 0 },
  39: { id: 39, key: "gambling_responsible", name: "Responsible Gambling & Self-Exclusion", targetPct: 0, targetBlogs: 0 },

  // apps_marketing (general: 16)
  40: { id: 40, key: "apps_productivity_reviews", name: "Productivity App Reviews", targetPct: 0, targetBlogs: 0 },
  41: { id: 41, key: "apps_pricing_comparisons", name: "App Pricing & Subscription Comparisons", targetPct: 0, targetBlogs: 0 },
  42: { id: 42, key: "apps_security_privacy", name: "App Security & Privacy", targetPct: 0, targetBlogs: 0 },

  // exclusive_models / creator platforms (general: 17)
  43: { id: 43, key: "creator_monetization", name: "Creator Monetization Strategy", targetPct: 0, targetBlogs: 0 },
  44: { id: 44, key: "creator_audience_growth", name: "Audience Growth & Promotion", targetPct: 0, targetBlogs: 0 },
  45: { id: 45, key: "creator_platform_fees", name: "Platform Fees & Payout Comparisons", targetPct: 0, targetBlogs: 0 },

  // ecom_nails (general: 18)
  46: { id: 46, key: "nails_techniques", name: "Gel & Dip Powder Techniques", targetPct: 0, targetBlogs: 0 },
  47: { id: 47, key: "nails_art_trends", name: "Nail Art Trends & Seasonal Designs", targetPct: 0, targetBlogs: 0 },
  48: { id: 48, key: "nails_product_reviews", name: "Beauty Product & Tool Reviews", targetPct: 0, targetBlogs: 0 },

  // soccer_jersey (general: 19)
  49: { id: 49, key: "jersey_authentic_replica", name: "Authentic vs Replica Kits", targetPct: 0, targetBlogs: 0 },
  50: { id: 50, key: "jersey_collecting_history", name: "Jersey Collecting & Kit History", targetPct: 0, targetBlogs: 0 },
  51: { id: 51, key: "jersey_sizing_care", name: "Sizing, Care & Customization", targetPct: 0, targetBlogs: 0 },

  // payment_processing (general: 20)
  52: { id: 52, key: "payments_fees_pricing", name: "Transaction Fees & Pricing Models", targetPct: 0, targetBlogs: 0 },
  53: { id: 53, key: "payments_compliance_fraud", name: "PCI Compliance & Fraud Prevention", targetPct: 0, targetBlogs: 0 },
  54: { id: 54, key: "payments_gateway_comparisons", name: "Gateway & Processor Comparisons", targetPct: 0, targetBlogs: 0 },

  // web_dev (general: 21)
  55: { id: 55, key: "webdev_frontend_performance", name: "Frontend Frameworks & Performance", targetPct: 0, targetBlogs: 0 },
  56: { id: 56, key: "webdev_backend_apis", name: "Backend & API Architecture", targetPct: 0, targetBlogs: 0 },
  57: { id: 57, key: "webdev_hosting_devops", name: "Hosting, Deployment & DevOps", targetPct: 0, targetBlogs: 0 },

  // app_dev (general: 22)
  58: { id: 58, key: "appdev_ios", name: "iOS Development", targetPct: 0, targetBlogs: 0 },
  59: { id: 59, key: "appdev_android", name: "Android Development", targetPct: 0, targetBlogs: 0 },
  60: { id: 60, key: "appdev_cross_platform", name: "Cross-Platform Frameworks", targetPct: 0, targetBlogs: 0 },

  // construction (general: 23)
  61: { id: 61, key: "construction_project_management", name: "Commercial Project Management", targetPct: 0, targetBlogs: 0 },
  62: { id: 62, key: "construction_bidding_estimating", name: "Bidding & Estimating", targetPct: 0, targetBlogs: 0 },
  63: { id: 63, key: "construction_materials_methods", name: "Building Materials & Methods", targetPct: 0, targetBlogs: 0 },

  // loans (general: 24)
  64: { id: 64, key: "loans_mortgages", name: "Mortgages & Home Financing", targetPct: 0, targetBlogs: 0 },
  65: { id: 65, key: "loans_personal_credit", name: "Personal Loans & Credit", targetPct: 0, targetBlogs: 0 },
  66: { id: 66, key: "loans_debt_refinancing", name: "Debt Consolidation & Refinancing", targetPct: 0, targetBlogs: 0 },

  // gym_franchise (general: 26)
  67: { id: 67, key: "gym_franchise_openings", name: "New Location Announcements", targetPct: 0, targetBlogs: 0 },
  68: { id: 68, key: "gym_franchise_ownership", name: "Franchise Ownership & Investment", targetPct: 0, targetBlogs: 0 },
  69: { id: 69, key: "gym_franchise_promotions", name: "Grand-Opening Promotions", targetPct: 0, targetBlogs: 0 },

  // roofing (general: 27)
  70: { id: 70, key: "roofing_materials", name: "Roofing Material Comparisons", targetPct: 0, targetBlogs: 0 },
  71: { id: 71, key: "roofing_insurance_storm", name: "Insurance Claims & Storm Damage", targetPct: 0, targetBlogs: 0 },
  72: { id: 72, key: "roofing_maintenance_repair", name: "Roof Maintenance & Repair", targetPct: 0, targetBlogs: 0 },

  // tax_lawyer (general: 28)
  73: { id: 73, key: "tax_audit_defense", name: "IRS Audit Defense", targetPct: 0, targetBlogs: 0, defaultStrictness: "strict" },
  74: { id: 74, key: "tax_debt_resolution", name: "Tax Debt Resolution & Settlements", targetPct: 0, targetBlogs: 0, defaultStrictness: "strict" },
  75: { id: 75, key: "tax_small_business", name: "Small-Business & Self-Employment Tax", targetPct: 0, targetBlogs: 0, defaultStrictness: "strict" },

  // pest_extermination (general: 29)
  76: { id: 76, key: "pest_seasonal", name: "Seasonal Pest Control", targetPct: 0, targetBlogs: 0 },
  77: { id: 77, key: "pest_termite", name: "Termite & Wood-Destroying Pests", targetPct: 0, targetBlogs: 0 },
  78: { id: 78, key: "pest_rodent_wildlife", name: "Rodent & Wildlife Management", targetPct: 0, targetBlogs: 0 },

  // charity (general: 30)
  79: { id: 79, key: "charity_fundraising", name: "Fundraising Campaigns", targetPct: 0, targetBlogs: 0 },
  80: { id: 80, key: "charity_donor_stewardship", name: "Donor Stewardship & Retention", targetPct: 0, targetBlogs: 0 },
  81: { id: 81, key: "charity_operations", name: "Nonprofit Operations & Governance", targetPct: 0, targetBlogs: 0 },

  // gym_subscription (general: 31)
  82: { id: 82, key: "gym_sub_chain_comparisons", name: "Chain Membership Comparisons", targetPct: 0, targetBlogs: 0 },
  83: { id: 83, key: "gym_sub_contracts", name: "Contract Terms & Cancellation", targetPct: 0, targetBlogs: 0 },
  84: { id: 84, key: "gym_sub_boutique", name: "Boutique vs Big-Box Gyms", targetPct: 0, targetBlogs: 0 },

  // online_casino (general: 32)
  85: { id: 85, key: "casino_slots_rtp", name: "Slots & RTP Analysis", targetPct: 0, targetBlogs: 0 },
  86: { id: 86, key: "casino_table_games", name: "Table Games Strategy", targetPct: 0, targetBlogs: 0 },
  87: { id: 87, key: "casino_bonuses", name: "Casino Bonuses & Wagering Requirements", targetPct: 0, targetBlogs: 0 },

  // real_estate (general: 33)
  88: { id: 88, key: "realestate_buying_selling", name: "Home Buying & Selling", targetPct: 0, targetBlogs: 0 },
  89: { id: 89, key: "realestate_mortgages", name: "Mortgages & Financing", targetPct: 0, targetBlogs: 0 },
  90: { id: 90, key: "realestate_investment", name: "Investment & Rental Property", targetPct: 0, targetBlogs: 0 },
};

export const SUB_NICHE_IDS: SubNicheId[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30, 31, 32, 33,
  34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67,
  68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84,
  85, 86, 87, 88, 89, 90,
];
/** Peptide-only sub-niche IDs (the original distribution). */
export const PEPTIDE_SUB_NICHE_IDS: SubNicheId[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
];

export function subNicheById(id: SubNicheId): SubNiche {
  return SUB_NICHES[id];
}
