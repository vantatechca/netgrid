/**
 * Vertical configs — blog-automation slice of the multi-vertical spec.
 *
 * The architecture spec defines 7 client verticals (peptides, gym openings,
 * gym subs, roofing, tax lawyer, pest, charity) with rich metadata covering
 * lead capture, payment processing, charity finance (T3010, P&L), call
 * tracking, compensation models, provincial fundraising registrations, etc.
 *
 * This module intentionally keeps ONLY the fields that influence content
 * generation:
 *
 *   - voice / sub-niche / compliance / citation library selection
 *   - language (en/fr) for bilingual blog rendering
 *   - schema priority for SEO output
 *   - data-pipeline source hints fed into the ideation prompt
 *   - topic angle suggestions
 *   - mandatory disclaimers and author-role identity constraints
 *   - lifecycle hint (pump-and-dump vs long-term) so the cadence/cron
 *     module can decide whether to lean evergreen or news-cycle
 *
 * Fields explicitly excluded (covered by future modules or out of scope for
 * a blog-automation-focused build):
 *
 *   - lead_capture_mode, lead_routing, compensation_model
 *   - Stripe Connect / donation processing
 *   - CRA receipts, T3010 fundraising-cost ratios, per-charity P&L
 *   - Provincial fundraising registration tracking
 *   - Custom call tracking
 *   - Roof quote calculator and other lead-gen widgets
 *   - Total site count, site stack (Astro), hosting topology
 */

import type {
  CitationStyleId,
  CompliancePhraseId,
  SchemaId,
  SubNicheId,
  VoiceId,
} from "../types";

/** Language code for the blog's output content. */
export type VerticalLanguage = "en" | "fr" | "en_fr";

/**
 * Content lifecycle hint — informs cron cadence and topic strategy.
 *
 *   - evergreen           : long-term defensible, prefer evergreen topics
 *   - news_cycle          : fast-turn news-cycle keywords (charity advocacy,
 *                           gym openings tied to current promotions)
 *   - hybrid              : both, weighted by editorial mode
 */
export type ContentLifecycle = "evergreen" | "news_cycle" | "hybrid";

/**
 * Geographic scope — informs schema markup and locale signals injected into
 * topic ideation.
 */
export type GeographyScope = "global" | "national" | "provincial" | "regional" | "city";

/**
 * Schema.org type the generated post should prioritise in its JSON-LD.
 * Maps to existing schemas.ts entries when present; otherwise a hint string
 * the generator can use to label the markup.
 */
export type SchemaPriority =
  | "Article"
  | "NewsArticle"
  | "MedicalWebPage"
  | "LegalService"
  | "LocalBusiness"
  | "HowTo"
  | "FAQPage"
  | "Organization"
  | "NGO";

/**
 * Content track — some verticals (notably charity #7) run two parallel
 * editorial modes in the same vertical: branded vs. independent advocacy.
 * Pure blog-automation cares only about the editorial differences, not the
 * legal/payment plumbing.
 */
export interface ContentTrack {
  key: string;
  label: string;
  /** Author identity / role for the byline and prompt persona. */
  authorRole: string;
  /** Mandatory disclaimer text appended to every post in this track. */
  disclaimers: string[];
  /** Voice IDs from voices.ts that fit this track. Empty → inherit vertical. */
  voiceIds?: VoiceId[];
  /** Per-track compliance phrase overrides. Empty → inherit vertical. */
  compliancePhraseIds?: CompliancePhraseId[];
}

/**
 * Data source hint passed into the ideation prompt to seed topic candidates.
 * The actual fetch/parse pipeline is out of scope for the blog-automation
 * module — these strings are descriptors the LLM uses to brainstorm what
 * kinds of stories/topics fit the vertical.
 */
export interface DataPipelineHint {
  /** Human-readable label, e.g. "Régie du bâtiment du Québec". */
  source: string;
  /** What kind of stories it suggests, e.g. "permit filings, contractor licensing". */
  storyAngle: string;
  /** Optional public URL the human operator can use as a manual reference. */
  url?: string;
}

export interface VerticalConfig {
  /** Stable identifier — used as the lookup key. */
  key: string;
  /** Display name shown in admin UIs. */
  name: string;
  /** Numeric ID matching the spec's "Client #N" labels. */
  clientNumber: number;
  /**
   * Niche key from src/lib/content/libraries/niches.ts. Vertical → niche
   * is many-to-one (e.g. gym openings + gym subs both share a niche),
   * niche → vertical is many-to-one too. This pointer keeps the existing
   * style-profile assignment flow intact: the generator first resolves
   * vertical → niche, then runs the existing niche-based profile picker.
   */
  nicheKey: string;
  /** Output language — drives the prompt's language directive. */
  language: VerticalLanguage;
  /** Sub-niche IDs available; overrides the niche default when present. */
  subNicheIds?: SubNicheId[];
  /** Voice IDs available; overrides the niche default when present. */
  voiceIds?: VoiceId[];
  /** Compliance phrase IDs to draw from; empty → no compliance enforced. */
  compliancePhraseIds: CompliancePhraseId[];
  /** Preferred citation style IDs (first one is the bias default). */
  citationStyleIds: CitationStyleId[];
  /** Schema.org type to prioritise in the JSON-LD output. */
  schemaPriority: SchemaPriority;
  /** Fallback to existing numeric schemas when a literal type doesn't map. */
  schemaIdFallback?: SchemaId;
  /** Content lifecycle hint for the cron + ideation modules. */
  lifecycle: ContentLifecycle;
  /**
   * Approximate site lifespan in months. Used by the cron to decide when a
   * blog enters "wind-down" mode (slows generation cadence). 0 → indefinite.
   */
  expectedLifespanMonths: number;
  /** Geographic scope — informs locale signals in the prompt. */
  geographyScope: GeographyScope;
  /** Target locations (cities, regions, provinces). Optional. */
  targetLocations: string[];
  /** Data pipeline hints fed into ideation for topic candidates. */
  dataPipelineHints: DataPipelineHint[];
  /**
   * News-friendly search terms for the daily Google News + NewsAPI
   * refresh. Each entry is a separate query. Keep these short and
   * news-vocabulary (e.g. "peptide therapy" not "Peptide Research
   * Network — the vertical's display name often isn't what newsrooms
   * actually write headlines about.
   *
   * When omitted, the news cron falls back to deriving queries from
   * `name + targetLocations + dataPipelineHints[].source`, which works
   * for local/news-cycle verticals but produces empty results for
   * evergreen industry verticals.
   */
  searchTerms?: string[];
  /** Topic-angle suggestions injected when ideation runs cold. */
  topicAngles: string[];
  /** Mandatory disclaimers appended to every post (e.g. legal disclaimer). */
  disclaimers: string[];
  /**
   * Required author role for the byline & prompt persona. Empty string →
   * use the voice's default persona.
   */
  authorRole: string;
  /**
   * Parallel editorial tracks (only charity uses this today). When empty,
   * the vertical runs as a single track using the top-level voice/compliance.
   */
  contentTracks: ContentTrack[];
  /** Free-form note for human operators. */
  description: string;
}
