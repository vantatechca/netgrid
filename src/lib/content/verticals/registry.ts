/**
 * 7-vertical registry — blog-automation slice.
 *
 * Each entry below pulls from the spec batches the operator delivered, but
 * keeps only the fields that influence content generation (see types.ts for
 * the full exclusion list).
 *
 * Vertical → niche mapping:
 *   #1 peptides              → niches.peptides
 *   #2 gym_openings          → niches.universal (no dedicated niche yet)
 *   #3 gym_subscriptions     → niches.universal (extends #2)
 *   #4 roofing_quebec        → niches.construction
 *   #5 tax_lawyer_quebec     → niches.universal (no dedicated legal niche yet)
 *   #6 pest_south_shore      → niches.universal
 *   #7 charity               → niches.universal
 *
 * The niche pointer keeps the existing voice / sub-niche / compliance flow
 * intact while still letting the vertical config override the pool when it
 * needs to (e.g. tax-lawyer forces a citation-heavy style).
 */

import type { VerticalConfig } from "./types";

export const VERTICALS: Record<string, VerticalConfig> = {
  // ───────────────────────────────────────────────────────────────────────
  // #1 — Peptide Research Network (continuation of existing build)
  // ───────────────────────────────────────────────────────────────────────
  peptides: {
    key: "peptides",
    name: "Peptide Research Network",
    clientNumber: 1,
    nicheKey: "peptides",
    language: "en",
    // Inherit the niche's full pool — peptides already owns V1-V77 and
    // sub-niches 1-13.
    compliancePhraseIds: Array.from({ length: 40 }, (_, i) => i + 1),
    citationStyleIds: [1, 2, 3],
    schemaPriority: "MedicalWebPage",
    schemaIdFallback: 1,
    lifecycle: "evergreen",
    expectedLifespanMonths: 0,
    geographyScope: "global",
    targetLocations: [],
    dataPipelineHints: [
      {
        source: "Published clinical trials (PubMed / ClinicalTrials.gov)",
        storyAngle:
          "trial readouts, phase progressions, mechanism-of-action explainers",
      },
      {
        source: "Manufacturer COAs and lab reports",
        storyAngle:
          "purity comparisons, dosage standards, reconstitution guides",
      },
      {
        source: "Shopify product catalogue (own stores)",
        storyAngle:
          "category-page support content, comparison posts, FAQ posts",
      },
    ],
    // News-friendly terms — what newsrooms actually write headlines
    // about, not the vertical's marketing name.
    searchTerms: [
      "peptide therapy",
      "GLP-1 weight loss",
      "BPC-157 research",
      "semaglutide news",
      "TB-500 healing",
    ],
    topicAngles: [
      "What the evidence actually says about <compound>",
      "Mechanism explainer for <compound> in plain language",
      "How <compound> compares to <adjacent compound>",
      "Dosage and reconstitution walkthrough",
      "What to look for in a quality COA",
    ],
    disclaimers: [],
    authorRole: "",
    contentTracks: [],
    description:
      "Original peptide research blog network. Uses the full V1-V77 voice library, 13 sub-niches, 40 compliance phrases. French-subdomain track is handled by a separate FR-language vertical if/when added.",
  },

  // ───────────────────────────────────────────────────────────────────────
  // #2 — Gym Franchise Openings (Quebec, FR, pump-and-dump 2-month lifespan)
  // ───────────────────────────────────────────────────────────────────────
  gym_openings: {
    key: "gym_openings",
    name: "Gym Franchise Openings (Quebec)",
    clientNumber: 2,
    nicheKey: "gym_franchise",
    language: "fr",
    compliancePhraseIds: [],
    citationStyleIds: [4, 5],
    schemaPriority: "LocalBusiness",
    lifecycle: "news_cycle",
    expectedLifespanMonths: 2,
    geographyScope: "city",
    targetLocations: [
      "Saint-Hyacinthe",
      "Drummondville",
      "Granby",
      "Sorel-Tracy",
      "Saint-Jean-sur-Richelieu",
      "Joliette",
      "Victoriaville",
      "Shawinigan",
      "Rimouski",
      "Rouyn-Noranda",
    ],
    dataPipelineHints: [
      {
        source: "Local news (Le Devoir, Journal de Montréal, regional weeklies)",
        storyAngle:
          "new franchise location announcements, grand opening dates, ribbon-cutting coverage",
      },
      {
        source: "Municipal permit filings",
        storyAngle: "build-out timelines, opening date confirmations",
      },
      {
        source: "Franchise press releases",
        storyAngle: "owner backgrounds, equipment partners, opening promotions",
      },
    ],
    searchTerms: [
      "nouveau gym Québec",
      "ouverture franchise gym",
      "Énergie Cardio",
      "Éconofitness",
      "Nautilus Plus",
    ],
    topicAngles: [
      "Nouveau gym qui ouvre à <ville> — ce que vous devez savoir",
      "Comparaison des forfaits d'ouverture de <chaîne>",
      "Les premiers utilisateurs racontent leur expérience à <gym>",
      "Combien coûte vraiment un abonnement à <chaîne>",
      "Cours offerts au nouveau <gym> de <ville>",
    ],
    disclaimers: [],
    authorRole: "Journaliste local couvrant les nouvelles ouvertures",
    contentTracks: [],
    description:
      "Short-lived French-language sites tied to specific gym franchise openings in small-town Quebec. Content stops when promotion period ends; cron should ramp down generation cadence after lifespan window.",
  },

  // ───────────────────────────────────────────────────────────────────────
  // #3 — Gym Subscription Leads (long-term, extends #2's promotion source)
  // ───────────────────────────────────────────────────────────────────────
  gym_subscriptions: {
    key: "gym_subscriptions",
    name: "Gym Subscriptions (Long-term)",
    clientNumber: 3,
    nicheKey: "gym_franchise",
    language: "fr",
    compliancePhraseIds: [],
    citationStyleIds: [4, 5],
    schemaPriority: "Article",
    lifecycle: "evergreen",
    expectedLifespanMonths: 0,
    geographyScope: "provincial",
    targetLocations: ["Québec", "Montréal", "Laval", "Gatineau", "Sherbrooke"],
    dataPipelineHints: [
      {
        source: "Gym chain pricing pages",
        storyAngle: "subscription tier comparisons, annual vs monthly math",
      },
      {
        source: "Fitness industry reports (IHRSA, Statistics Canada)",
        storyAngle: "membership retention stats, regional pricing trends",
      },
    ],
    searchTerms: [
      "abonnement gym Québec",
      "industrie fitness Canada",
      "tendances entraînement",
      "santé conditionnement physique",
    ],
    topicAngles: [
      "Meilleurs forfaits de gym au Québec en <année>",
      "Comment résilier un abonnement de gym sans frais",
      "Gym à domicile vs abonnement — le vrai calcul",
      "Programmes d'entraînement pour débutants",
      "Comparaison: <chaîne A> vs <chaîne B>",
    ],
    disclaimers: [],
    authorRole: "Rédacteur santé et conditionnement physique",
    contentTracks: [],
    description:
      "Defensible long-term French-language sites that receive promotion handoff from gym-opening sites (#2) after their pump cycle ends. Evergreen subscription-decision content.",
  },

  // ───────────────────────────────────────────────────────────────────────
  // #4 — Roofing Quebec (regional contractor lead network)
  // ───────────────────────────────────────────────────────────────────────
  roofing_quebec: {
    key: "roofing_quebec",
    name: "Roofing Quebec",
    clientNumber: 4,
    nicheKey: "construction",
    language: "fr",
    compliancePhraseIds: [],
    citationStyleIds: [4, 5],
    schemaPriority: "LocalBusiness",
    lifecycle: "evergreen",
    expectedLifespanMonths: 0,
    geographyScope: "provincial",
    targetLocations: [
      "Montréal",
      "Laval",
      "Longueuil",
      "Québec",
      "Gatineau",
      "Sherbrooke",
      "Trois-Rivières",
      "Saguenay",
    ],
    dataPipelineHints: [
      {
        source: "Régie du bâtiment du Québec (RBQ)",
        storyAngle: "licensed contractor verification, RBQ category requirements",
        url: "https://www.rbq.gouv.qc.ca/",
      },
      {
        source: "Environment Canada historical weather data",
        storyAngle:
          "storm damage windows, hail event lookbacks, freeze-thaw cycle counts",
      },
      {
        source: "Municipal building permit data",
        storyAngle: "permit timing, roof replacement permit walkthroughs",
      },
    ],
    searchTerms: [
      "toiture Québec",
      "couvreur Montréal",
      "tempête de grêle Québec",
      "RBQ couvreur",
      "rénovation toiture",
    ],
    topicAngles: [
      "Combien coûte une toiture neuve à <ville> en <année>",
      "Bardeaux d'asphalte vs tôle: quel choix pour <région>",
      "Comment vérifier la licence RBQ d'un couvreur",
      "Signes que votre toit a besoin d'être remplacé",
      "Garantie de toiture: ce qui est vraiment couvert",
    ],
    disclaimers: [
      "Les estimations de coûts sont indicatives et varient selon la région, la pente et l'état de la toiture.",
    ],
    authorRole: "Spécialiste en construction résidentielle",
    contentTracks: [],
    description:
      "Quebec-wide roofing lead network. Content draws on RBQ licensing and weather data for credibility. Lead-capture widgets (roof quote calculator) are NOT part of the blog-automation slice — handled by a future module.",
  },

  // ───────────────────────────────────────────────────────────────────────
  // #5 — Tax Lawyer Quebec (very high compliance, strict author role)
  // ───────────────────────────────────────────────────────────────────────
  tax_lawyer_quebec: {
    key: "tax_lawyer_quebec",
    name: "Tax Lawyer (Quebec)",
    clientNumber: 5,
    nicheKey: "universal",
    language: "fr",
    compliancePhraseIds: [],
    // Legal content leans formal citation styles (academic / footnoted).
    citationStyleIds: [1, 2],
    schemaPriority: "LegalService",
    lifecycle: "evergreen",
    expectedLifespanMonths: 0,
    geographyScope: "provincial",
    targetLocations: ["Québec", "Montréal", "Laval", "Gatineau"],
    dataPipelineHints: [
      {
        source: "Canada Revenue Agency (CRA) publications",
        storyAngle: "tax-policy explainers, CRA bulletin walkthroughs",
        url: "https://www.canada.ca/en/revenue-agency.html",
      },
      {
        source: "Revenu Québec bulletins",
        storyAngle: "Quebec-specific tax interpretations, provincial credits",
        url: "https://www.revenuquebec.ca/",
      },
      {
        source: "Tax Court of Canada decisions (public docket)",
        storyAngle: "decision summaries, precedent explainers",
      },
    ],
    searchTerms: [
      "Revenu Québec",
      "ARC vérification fiscale",
      "droit fiscal Québec",
      "Cour canadienne de l'impôt",
      "crédit d'impôt Québec",
    ],
    topicAngles: [
      "Que faire en cas d'avis de cotisation de Revenu Québec",
      "Différence entre évitement fiscal et évasion fiscale",
      "Vos droits lors d'une vérification fiscale",
      "Crédit d'impôt pour <programme> — qui est admissible",
      "Quand consulter un avocat fiscaliste plutôt qu'un comptable",
    ],
    disclaimers: [
      "Ce contenu est fourni à titre informatif uniquement et ne constitue pas un avis juridique. Consultez un avocat qualifié pour votre situation particulière.",
      "L'auteur n'est pas avocat. Les informations présentées sont issues de sources publiques et ne créent aucune relation avocat-client.",
    ],
    // Strictly enforced — the assignment algorithm must NOT pick a voice
    // that overrides this byline. The scrubber should flag any post whose
    // byline drifts from this string.
    authorRole: "Recherchiste en information juridique",
    contentTracks: [],
    description:
      "Quebec tax-law information sites. Highest compliance posture in the network: every post carries mandatory disclaimers and the author byline is strictly fixed to 'Recherchiste en information juridique' — never 'avocat' or 'avocate'. Bar-review queue handled separately by the manual-review module.",
  },

  // ───────────────────────────────────────────────────────────────────────
  // #6 — Pest Control (South Shore Montreal, phone-primary)
  // ───────────────────────────────────────────────────────────────────────
  pest_south_shore: {
    key: "pest_south_shore",
    name: "Pest Control (South Shore Montreal)",
    clientNumber: 6,
    nicheKey: "universal",
    language: "fr",
    compliancePhraseIds: [],
    citationStyleIds: [4, 5],
    schemaPriority: "LocalBusiness",
    lifecycle: "evergreen",
    expectedLifespanMonths: 0,
    geographyScope: "regional",
    targetLocations: [
      "Brossard",
      "Longueuil",
      "Saint-Lambert",
      "Boucherville",
      "Saint-Bruno-de-Montarville",
      "Saint-Hubert",
      "Greenfield Park",
      "La Prairie",
      "Candiac",
      "Châteauguay",
    ],
    dataPipelineHints: [
      {
        source: "Pest Management Regulatory Agency (PMRA) registry",
        storyAngle:
          "registered pesticide lookups, active-ingredient explainers, label-rate verification",
        url: "https://pest-control.canada.ca/",
      },
      {
        source: "Quebec Ministry of Environment seasonal advisories",
        storyAngle: "tick season warnings, mosquito advisory windows",
      },
    ],
    searchTerms: [
      "extermination Rive-Sud",
      "punaise de lit Québec",
      "fourmis charpentières",
      "tique maladie Lyme",
      "gestion parasitaire Montréal",
    ],
    topicAngles: [
      "Comment se débarrasser des <ravageur> à <ville>",
      "Saison des <ravageur> sur la Rive-Sud: que faire",
      "Traitements PMRA homologués pour <problème>",
      "Coût moyen d'une extermination à <ville>",
      "Prévention vs extermination — quand appeler un professionnel",
    ],
    disclaimers: [
      "Utilisez les pesticides en respectant strictement les étiquettes homologuées par l'ARLA. En cas de doute, consultez un exterminateur certifié.",
    ],
    authorRole: "Spécialiste en gestion parasitaire",
    contentTracks: [],
    description:
      "Phone-primary pest-control network for the South Shore of Montreal. Content draws on PMRA registry for credibility on pesticide-related posts. Call-tracking and lead routing are out of scope for the blog-automation slice.",
  },

  // ───────────────────────────────────────────────────────────────────────
  // #7 — Charity (two parallel content tracks: branded news + advocacy)
  // ───────────────────────────────────────────────────────────────────────
  charity: {
    key: "charity",
    name: "Charity Network",
    clientNumber: 7,
    nicheKey: "universal",
    language: "en_fr",
    compliancePhraseIds: [],
    citationStyleIds: [1, 2, 4],
    schemaPriority: "NGO",
    lifecycle: "news_cycle",
    expectedLifespanMonths: 0,
    geographyScope: "national",
    targetLocations: ["Canada"],
    dataPipelineHints: [
      {
        source: "Google News (charity & non-profit query terms)",
        storyAngle: "daily news-cycle keyword refresh",
        url: "https://news.google.com/",
      },
      {
        source: "CBC News / CTV News",
        storyAngle: "current-events angles connected to charity missions",
      },
      {
        source: "Reddit (relevant subreddits)",
        storyAngle: "community-driven story angles, public sentiment",
      },
      {
        source: "Statistics Canada public datasets",
        storyAngle: "policy impact framing, beneficiary population sizing",
      },
    ],
    searchTerms: [
      "Canadian charity",
      "homelessness Canada",
      "food bank Canada",
      "non-profit funding",
      "CRA charity",
      "donations Canada",
    ],
    topicAngles: [
      "How <issue> affects Canadians in <region> right now",
      "What <recent news event> means for <beneficiary group>",
      "Inside the work: how <charity> is responding to <crisis>",
      "Five ways to support <cause> beyond donating",
      "Policy explainer: <government program> and who it leaves out",
    ],
    disclaimers: [],
    authorRole: "",
    // Parallel editorial tracks — same vertical, different voice & byline
    // posture. Charity finance/T3010/Stripe Connect plumbing is NOT here.
    contentTracks: [
      {
        key: "charity_branded",
        label: "Charity-Branded News Sub-Network (7A)",
        authorRole: "Communications writer for the charity",
        disclaimers: [
          "This article is published by <charity name>, a registered Canadian charity. Donations support our programs.",
        ],
      },
      {
        key: "independent_advocacy",
        label: "Independent Advocacy Sub-Network (7B)",
        authorRole: "Independent advocacy journalist",
        disclaimers: [
          "This site is operated by an independent advocacy organisation and is not affiliated with any registered charity.",
          // CASL (Canada's Anti-Spam Legislation) disclosure stays in the
          // blog-automation slice because it must appear at the bottom of
          // every advocacy post regardless of how lead capture is wired.
          "Conforms to Canada's Anti-Spam Legislation (CASL). You may unsubscribe from any communications at any time.",
        ],
      },
    ],
    description:
      "National bilingual charity network with two parallel editorial tracks: charity-branded news (7A) and independent advocacy (7B). News-cycle keyword refresh drives daily topic ideation. Donation processing, CRA receipts, T3010 fundraising-cost tracking, P&L, and provincial fundraising registration tracking are out of scope for the blog-automation slice — handled by a separate charity-finance module.",
  },
};

export const VERTICAL_KEYS = Object.keys(VERTICALS);
