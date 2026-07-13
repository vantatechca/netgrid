import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  date,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "client"]);
export const clientStatusEnum = pgEnum("client_status", ["onboarding", "active", "paused", "churned"]);
export const blogStatusEnum = pgEnum("blog_status", ["active", "paused", "setup", "decommissioned"]);
export const seoPluginEnum = pgEnum("seo_plugin", ["yoast", "rankmath", "none"]);
export const platformEnum = pgEnum("platform", ["wordpress", "shopify"]);
export const shopifyAuthModeEnum = pgEnum("shopify_auth_mode", [
  "legacy_token",
  "client_credentials",
]);
export const seoCategoryEnum = pgEnum("seo_category", ["meta", "content", "technical", "links", "images", "schema", "performance"]);
export const issueSeverityEnum = pgEnum("issue_severity", ["critical", "warning", "notice"]);
export const issueStatusEnum = pgEnum("issue_status", ["detected", "queued", "approved", "applied", "verified", "dismissed", "failed"]);
export const senderRoleEnum = pgEnum("sender_role", ["admin", "client", "system"]);
export const seoTrendEnum = pgEnum("seo_trend", ["improving", "stable", "declining"]);
export const checkTypeEnum = pgEnum("check_type", ["scheduled", "manual"]);
export const thirdPartySourceEnum = pgEnum("third_party_source", ["ahrefs", "semrush", "moz"]);
export const generatedPostStatusEnum = pgEnum("generated_post_status", ["pending", "generating", "generated", "publishing", "published", "failed"]);
export const scrubberStrictnessEnum = pgEnum("scrubber_strictness", ["loose", "standard", "strict"]);
export const compliancePlacementEnum = pgEnum("compliance_placement", [
  "TOP",
  "BOTTOM",
  "TOP_AND_BOTTOM",
  "INLINE",
  "ABOUT_ONLY",
  "ROTATING",
]);
export const knowledgeSourceTypeEnum = pgEnum("knowledge_source_type", [
  "spreadsheet",
  "csv",
  "docx",
  "pdf",
  "image",
  "text",
]);
export const knowledgeExtractionStatusEnum = pgEnum("knowledge_extraction_status", [
  "pending",
  "extracted",
  "failed",
]);

// ─── 1. users ────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull().default("client"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  avatarUrl: text("avatar_url"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_client_id_idx").on(table.clientId),
]);

// ─── 2. clients ──────────────────────────────────────────────────────────────

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  niche: varchar("niche", { length: 255 }),
  totalBlogsTarget: integer("total_blogs_target").default(0),
  notesInternal: text("notes_internal"),
  // Optional custom generation prompt (client-level default). When set, it
  // drives article generation for this client's blogs instead of the
  // Client-wide custom generation prompt. When set, ALL of this client's blogs
  // are generated from it instead of the niche/persona style. Compliance and
  // the JSON output contract stay locked regardless.
  customPrompt: text("custom_prompt"),
  // When the custom prompt is active, also layer each blog's generated
  // persona/voice on top of it (instead of the custom prompt fully replacing
  // the persona). Persona is still per-blog, so each site keeps its own voice.
  // Off by default — a plain custom prompt keeps replacing the persona.
  stackPersona: boolean("stack_persona").default(false).notNull(),
  // Call-to-action button appended to the bottom of every published post for
  // this client (link to their main site / contact / registration page).
  ctaEnabled: boolean("cta_enabled").default(false).notNull(),
  ctaLabel: varchar("cta_label", { length: 80 }),
  ctaUrl: varchar("cta_url", { length: 1000 }),
  // Where the button appears: "bottom" | "top_bottom" | "top_middle_bottom".
  ctaPlacement: varchar("cta_placement", { length: 40 }).default("bottom"),
  // Manual seed terms (newline/comma separated) fed to the keyword scraper
  // alongside the client's niche key-topics. See client_keywords.
  keywordSeeds: text("keyword_seeds"),
  // Peptides-only programmatic location pages: target locations (newline/comma
  // separated) + drip campaign controls. See peptide_location_targets.
  peptideLocations: text("peptide_locations"),
  // Optional global dosage list (newline/comma separated) for location pages.
  peptideDosages: text("peptide_dosages"),
  locationCampaignEnabled: boolean("location_campaign_enabled").default(false).notNull(),
  locationPagesPerDay: integer("location_pages_per_day").default(2).notNull(),
  // Post language control: "en" | "fr" | "en_fr" | null.
  //   en    → all posts English
  //   fr    → all posts French
  //   en_fr → posts alternate English / French (strict, per blog)
  //   null  → legacy derived behaviour (niche / TLD / vertical rules)
  // When set, overrides the hardcoded niche/TLD language locks.
  languageMode: varchar("language_mode", { length: 8 }),
  status: clientStatusEnum("status").default("onboarding"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("clients_status_idx").on(table.status),
]);

// ─── 3. blogs ────────────────────────────────────────────────────────────────

export const blogs = pgTable("blogs", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull(),
  platform: platformEnum("platform").default("wordpress").notNull(),
  wpUrl: varchar("wp_url", { length: 500 }),
  wpUsername: varchar("wp_username", { length: 255 }),
  wpAppPassword: varchar("wp_app_password", { length: 255 }),
  seoPlugin: seoPluginEnum("seo_plugin").default("none"),
  shopifyStoreUrl: varchar("shopify_store_url", { length: 500 }),
  shopifyAdminApiToken: varchar("shopify_admin_api_token", { length: 500 }),

  // Shopify auth & metadata
  shopifyAuthMode: shopifyAuthModeEnum("shopify_auth_mode").default("client_credentials"),
  shopifyClientId: varchar("shopify_client_id", { length: 255 }),
  shopifyClientSecret: varchar("shopify_client_secret", { length: 500 }),
  shopifyBlogHandle: varchar("shopify_blog_handle", { length: 255 }),
  shopifyGrantedScopes: text("shopify_granted_scopes"),

  postingFrequency: varchar("posting_frequency", { length: 50 }),
  postingFrequencyDays: integer("posting_frequency_days").array(),
  // Sub-day cadence. Daily quota (e.g. 2 = max 2 posts per UTC day). Takes
  // precedence over postingFrequencyDays when set.
  postsPerDay: integer("posts_per_day"),
  // Minimum hours between consecutive posts on this blog. e.g. with
  // postsPerDay=2 and postingIntervalHours=6: post #1 at T+0, post #2 at T+6h,
  // then wait for the next UTC day.
  postingIntervalHours: integer("posting_interval_hours"),
  lastPostVerifiedAt: timestamp("last_post_verified_at"),
  lastPostTitle: varchar("last_post_title", { length: 500 }),
  currentSeoScore: integer("current_seo_score"),
  lastSeoScanAt: timestamp("last_seo_scan_at"),
  status: blogStatusEnum("status").default("setup"),
  notesInternal: text("notes_internal"),
  // Deprecated per-blog custom generation prompt column. Custom prompts are now
  // client-wide only (see clients.customPrompt) — this column is retained for
  // back-compat but is no longer read or written by the app.
  customPrompt: text("custom_prompt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("blogs_domain_idx").on(table.domain),
  index("blogs_client_id_idx").on(table.clientId),
  index("blogs_status_idx").on(table.status),
]);

// ─── 4. seo_scans ───────────────────────────────────────────────────────────

export const seoScans = pgTable("seo_scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  overallScore: integer("overall_score").notNull(),
  metaScore: integer("meta_score").notNull(),
  contentScore: integer("content_score").notNull(),
  technicalScore: integer("technical_score").notNull(),
  linkScore: integer("link_score").notNull(),
  imageScore: integer("image_score").notNull(),
  pagesCrawled: integer("pages_crawled").default(0),
  issuesFound: integer("issues_found").default(0),
  criticalIssues: integer("critical_issues").default(0),
  warnings: integer("warnings").default(0),
  notices: integer("notices").default(0),
  rawData: jsonb("raw_data"),
  scanDurationMs: integer("scan_duration_ms"),
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
}, (table) => [
  index("seo_scans_blog_id_idx").on(table.blogId),
  index("seo_scans_client_id_idx").on(table.clientId),
  index("seo_scans_scanned_at_idx").on(table.scannedAt),
]);

// ─── 5. seo_issues ──────────────────────────────────────────────────────────

export const seoIssues = pgTable("seo_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scan_id").notNull().references(() => seoScans.id, { onDelete: "cascade" }),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  pageUrl: varchar("page_url", { length: 1000 }),
  category: seoCategoryEnum("category").notNull(),
  severity: issueSeverityEnum("severity").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  suggestedFix: text("suggested_fix"),
  fixPayload: jsonb("fix_payload"),
  status: issueStatusEnum("status").default("detected"),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  appliedAt: timestamp("applied_at"),
  verifiedAt: timestamp("verified_at"),
  failureReason: text("failure_reason"),
  autoFixable: boolean("auto_fixable").default(false),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("seo_issues_blog_id_idx").on(table.blogId),
  index("seo_issues_client_id_idx").on(table.clientId),
  index("seo_issues_status_idx").on(table.status),
  index("seo_issues_severity_idx").on(table.severity),
]);

// ─── 6. post_verifications ──────────────────────────────────────────────────

export const postVerifications = pgTable("post_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  checkType: checkTypeEnum("check_type").default("scheduled"),
  latestPostDate: timestamp("latest_post_date"),
  latestPostTitle: varchar("latest_post_title", { length: 500 }),
  latestPostUrl: varchar("latest_post_url", { length: 1000 }),
  postsInPeriod: integer("posts_in_period").default(0),
  expectedPosts: integer("expected_posts").default(0),
  onSchedule: boolean("on_schedule").default(true),
  daysSinceLastPost: integer("days_since_last_post"),
  alertTriggered: boolean("alert_triggered").default(false),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (table) => [
  index("post_verifications_blog_id_idx").on(table.blogId),
  index("post_verifications_client_id_idx").on(table.clientId),
]);

// ─── 8. messages ─────────────────────────────────────────────────────────────

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
  senderRole: senderRoleEnum("sender_role").notNull(),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false),
  attachments: jsonb("attachments"),
  readByClient: boolean("read_by_client").default(false),
  readByAdmin: boolean("read_by_admin").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("messages_client_id_idx").on(table.clientId),
  index("messages_sender_id_idx").on(table.senderId),
]);

// ─── 9. reports ──────────────────────────────────────────────────────────────

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  title: varchar("title", { length: 255 }),
  summaryHtml: text("summary_html"),
  overallSeoTrend: seoTrendEnum("overall_seo_trend"),
  avgSeoScore: integer("avg_seo_score"),
  totalPostsPublished: integer("total_posts_published"),
  totalIssuesFixed: integer("total_issues_fixed"),
  blogsOnSchedule: integer("blogs_on_schedule"),
  blogsOffSchedule: integer("blogs_off_schedule"),
  // Generation cost (text + images) for posts created during the report's
  // period. Computed at report-generation time; null on reports generated
  // before this column existed.
  totalCostUsd: decimal("total_cost_usd", { precision: 10, scale: 6 }),
  highlights: jsonb("highlights"),
  concerns: jsonb("concerns"),
  rawData: jsonb("raw_data"),
  visibleToClient: boolean("visible_to_client").default(false),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  index("reports_client_id_idx").on(table.clientId),
]);

// ─── 11. seo_third_party_data ───────────────────────────────────────────────

export const seoThirdPartyData = pgTable("seo_third_party_data", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  source: thirdPartySourceEnum("source").notNull(),
  domainAuthority: integer("domain_authority"),
  backlinksTotal: integer("backlinks_total"),
  referringDomains: integer("referring_domains"),
  organicKeywords: integer("organic_keywords"),
  organicTrafficEst: integer("organic_traffic_est"),
  topKeywords: jsonb("top_keywords"),
  rawResponse: jsonb("raw_response"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (table) => [
  index("seo_third_party_blog_id_idx").on(table.blogId),
  index("seo_third_party_client_id_idx").on(table.clientId),
]);

// ─── generated_posts ────────────────────────────────────────────────────────

export const generatedPosts = pgTable("generated_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  topic: varchar("topic", { length: 500 }).notNull(),
  keywords: jsonb("keywords"),
  title: varchar("title", { length: 500 }),
  body: text("body"),
  excerpt: text("excerpt"),
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),
  featuredImageUrl: text("featured_image_url"),
  // Second image — a deliberately differently-framed shot of the same
  // topic, embedded into the body HTML at roughly the midpoint by
  // content-generator.ts. Stored separately from featuredImageUrl so
  // we can reuse it (e.g. for social cards) without re-extracting from
  // the body. Always a data: URI when present.
  bodyImageUrl: text("body_image_url"),
  wordCount: integer("word_count"),
  seoScore: integer("seo_score"),
  readabilityScore: integer("readability_score"),
  brandVoiceScore: integer("brand_voice_score"),
  tokensUsed: integer("tokens_used"),
  costUsd: decimal("cost_usd", { precision: 10, scale: 6 }),
  status: generatedPostStatusEnum("status").default("pending").notNull(),
  // Concrete language this post was written in ("en" | "fr"), recorded at
  // generation time. Drives strict EN/FR alternation for bilingual clients
  // (flip the blog's most recent post language) and serves as an audit trail.
  language: varchar("language", { length: 2 }),
  failureReason: text("failure_reason"),
  externalPostId: varchar("external_post_id", { length: 100 }),
  externalPostUrl: varchar("external_post_url", { length: 1000 }),
  isAutoGenerated: boolean("is_auto_generated").default(false),
  // Scrubber audit trail. Shape mirrors ScrubberReport in
  // src/lib/content/scrubber/types.ts; jsonb so we can GROUP BY violation
  // kinds without locking the report shape in DDL.
  scrubberReport: jsonb("scrubber_report"),
  flaggedForReview: boolean("flagged_for_review").default(false).notNull(),
  generatedAt: timestamp("generated_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("generated_posts_blog_id_idx").on(table.blogId),
  index("generated_posts_client_id_idx").on(table.clientId),
  index("generated_posts_status_idx").on(table.status),
  index("generated_posts_created_at_idx").on(table.createdAt),
]);

// ─── style_profiles ─────────────────────────────────────────────────────────
// One per blog. Built by the 14-phase assignment algorithm at blog creation.
// Locked after assignment — never re-rolled automatically. Field IDs reference
// the library files in src/lib/content/libraries/*.

export const styleProfiles = pgTable("style_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id")
    .notNull()
    .references(() => blogs.id, { onDelete: "cascade" })
    .unique(),
  // Future-proofing for non-peptide expansions. Currently always "peptides".
  nicheKey: varchar("niche_key", { length: 64 }).notNull().default("peptides"),

  // Locked stylistic core (referencing the libraries by integer ID)
  subNicheId: integer("sub_niche_id").notNull(),
  voiceId: integer("voice_id").notNull(),
  skeletonId: integer("skeleton_id").notNull(),
  cadenceId: integer("cadence_id").notNull(),
  quirks: integer("quirks").array().notNull(),
  schemaId: integer("schema_id").notNull(),
  tagSetId: integer("tag_set_id").notNull(),
  citationStyleId: integer("citation_style_id").notNull(),

  // Per-post draws
  structuralPool: integer("structural_pool").array().notNull(),

  // Compliance
  compliancePhraseIds: integer("compliance_phrase_ids").array().notNull(),
  compliancePlacement: compliancePlacementEnum("compliance_placement").notNull(),

  // Operational
  wordBandMin: integer("word_band_min").notNull(),
  wordBandMax: integer("word_band_max").notNull(),
  scrubberStrictness: scrubberStrictnessEnum("scrubber_strictness")
    .notNull()
    .default("standard"),

  // Niche content
  primaryCompounds: text("primary_compounds").array().notNull(),
  secondaryCompounds: text("secondary_compounds").array().notNull(),

  // Audit
  assignmentSeed: varchar("assignment_seed", { length: 64 }),
  // Hamming distance from the closest existing profile at the moment
  // this profile was assigned. Computed as sum of integer single-valued
  // mismatches (0-8) + 3 Jaccard distances (0.0-1.0 each), so the
  // realistic range is 0.00-11.00. Stored as decimal because Jaccard
  // produces fractional values (e.g. 9.55 means 8 single-valued
  // mismatches + ~1.55 fractional set-distance).
  minHammingAtAssign: decimal("min_hamming_at_assign", { precision: 5, scale: 2 }),
  // Phase 3: optional LLM-generated per-blog persona. Shape mirrors
  // GeneratedPersona in src/lib/content/persona-generator.ts. When present,
  // composeForPost uses it for the voice slots instead of the library voice —
  // a unique generated voice per blog. Null → use the library voiceId
  // (behavior unchanged). generatedPersonaSeed keeps the operator's seed inputs
  // so the persona can be regenerated with the same direction.
  generatedPersona: jsonb("generated_persona"),
  generatedPersonaSeed: text("generated_persona_seed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("style_profiles_blog_id_idx").on(table.blogId),
  index("style_profiles_sub_niche_idx").on(table.subNicheId),
  index("style_profiles_voice_idx").on(table.voiceId),
]);

// ─── 11b. niche_profiles ────────────────────────────────────────────────────
// Auto-generated niche definitions for client niches NOT hardcoded in
// src/lib/content/libraries/niches.ts. Created once (LLM) when a client with a
// new niche is added, cached in memory at runtime, and reused like the
// built-in niches. `key` is the normalized niche key (e.g. "restaurant").
export const nicheProfiles = pgTable("niche_profiles", {
  key: varchar("key", { length: 80 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  audience: text("audience").notNull(),
  brandVoice: text("brand_voice").notNull(),
  contentStyle: text("content_style").notNull(),
  requirements: text("requirements").notNull(),
  keyTopics: text("key_topics").array().notNull(),
  primaryTerms: text("primary_terms").array().notNull(),
  adjacentTerms: text("adjacent_terms").array().notNull(),
  source: varchar("source", { length: 24 }).notNull().default("generated"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 12. activity_log ───────────────────────────────────────────────────────

export const activityLog = pgTable("activity_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("activity_log_user_id_idx").on(table.userId),
  index("activity_log_client_id_idx").on(table.clientId),
  index("activity_log_created_at_idx").on(table.createdAt),
]);

// ─── news_items ─────────────────────────────────────────────────────────────
//
// Cached headlines fetched from Google News RSS (and optional NewsAPI /
// GNews fallbacks) keyed by vertical. The auto-publish ideation step
// reads recent rows for the blog's vertical so Claude can brainstorm
// topics tied to current local/international news instead of cold.
//
// Rows are immutable: the refresh cron upserts on (verticalKey, link)
// so duplicates from multiple queries on the same vertical collapse.

export const newsItems = pgTable("news_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  verticalKey: varchar("vertical_key", { length: 64 }).notNull(),
  // The query string that surfaced this item (one vertical may run
  // several queries — one per topic angle / location). Useful for
  // attribution and for skipping stale queries during re-fetch.
  query: varchar("query", { length: 256 }).notNull(),
  // Source label: "google_news_rss" | "newsapi" | "gnews".
  source: varchar("source", { length: 32 }).notNull(),
  // Publisher (e.g. "CBC News", "Le Devoir"). Optional — RSS sometimes
  // omits it.
  publisher: varchar("publisher", { length: 128 }),
  title: varchar("title", { length: 512 }).notNull(),
  link: varchar("link", { length: 1024 }).notNull(),
  snippet: text("snippet"),
  language: varchar("language", { length: 8 }),
  country: varchar("country", { length: 8 }),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  // True once the row has been surfaced to an ideation prompt —
  // optional dedupe signal so the same headline doesn't seed
  // back-to-back topics on the same blog.
  usedInIdeation: boolean("used_in_ideation").default(false).notNull(),
  raw: jsonb("raw"),
}, (table) => [
  index("news_items_vertical_idx").on(table.verticalKey),
  index("news_items_fetched_at_idx").on(table.fetchedAt),
  index("news_items_published_at_idx").on(table.publishedAt),
  uniqueIndex("news_items_vertical_link_uk").on(table.verticalKey, table.link),
]);

// ─── knowledge_documents ──────────────────────────────────────────────────────
//
// Per-client Knowledge Base. The team uploads briefs, keyword sheets, brand
// guides, etc.; each file is normalised to Markdown at upload time (see
// services/knowledge-converter.ts) and run through a one-time extraction pass
// (services/knowledge-extractor.ts) that distills keywords, topics, and a
// summary. Ideation and generation later read the active rows for a blog/client
// so Claude works from the client's actual material instead of generic niche
// keyword lists.
//
// blogId is nullable: when set, the document is scoped to a single blog; when
// null it applies to the whole client (shared across all its blogs).

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  blogId: uuid("blog_id").references(() => blogs.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  contentType: varchar("content_type", { length: 150 }),
  sourceType: knowledgeSourceTypeEnum("source_type").notNull(),
  // Normalised Markdown body — the canonical form fed to Claude.
  markdown: text("markdown").notNull(),
  charCount: integer("char_count").notNull().default(0),
  // True when extraction produced suspiciously little text (e.g. a scanned
  // PDF with no text layer) — surfaced for manual review.
  lowConfidence: boolean("low_confidence").notNull().default(false),
  warnings: jsonb("warnings"), // string[] of non-fatal conversion notes
  // Distilled knowledge from the one-time extraction pass.
  extractedKeywords: jsonb("extracted_keywords"), // string[]
  extractedTopics: jsonb("extracted_topics"), // string[]
  summary: text("summary"),
  extractionStatus: knowledgeExtractionStatusEnum("extraction_status")
    .notNull()
    .default("pending"),
  extractionError: text("extraction_error"),
  // Whether this document should be consulted during ideation/generation.
  isActive: boolean("is_active").notNull().default(true),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("knowledge_documents_client_id_idx").on(table.clientId),
  index("knowledge_documents_blog_id_idx").on(table.blogId),
  index("knowledge_documents_active_idx").on(table.isActive),
]);

// ─── niches ───────────────────────────────────────────────────────────────────
//
// The editable, per-niche generation config. Phase 0 of the content-config
// rebuild: these rows are SEEDED from the currently-hardcoded niche rules in
// content-generator.ts (NICHE_CONTEXTS + getNicheRequirements) so ops can review
// and edit them in the admin "Niches" screen. Generation still reads the code
// path in Phase 0 — this table is a shadow copy until the composer is switched
// over to read from it.
//
// `key` matches normalizeNicheKey() output (e.g. "peptides", "tax_lawyer"), so a
// blog's free-text clients.niche resolves to a row by the same normalization.

export const niches = pgTable("niches", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 255 }).notNull(),
  defaultAudience: text("default_audience"),
  defaultBrandVoice: text("default_brand_voice"),
  // The long "contentStyle" directive (voice/approach) that goes into the prompt.
  contentStyle: text("content_style"),
  // string[] — topical anchors used by ideation + generation.
  keyTopics: jsonb("key_topics"),
  // The per-niche writing-requirements block (getNicheRequirements).
  requirements: text("requirements"),
  // string[] — compliance/legal disclaimers (locked layer; mostly empty at seed
  // time since today's disclaimers live in the peptide/gambling phrase library).
  disclaimers: jsonb("disclaimers"),
  // Optional niche-level word-count override (per-blog band still wins today).
  wordBandMin: integer("word_band_min"),
  wordBandMax: integer("word_band_max"),
  // Provenance: "seed" = mirrored from code, "manual" = hand-edited in the UI,
  // "imported" = extracted from an uploaded file (Phase 2). Lets re-sync skip
  // hand-edited rows so it never clobbers ops changes.
  source: varchar("source", { length: 20 }).notNull().default("seed"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("niches_key_idx").on(table.key),
]);

// ─── client_keywords ──────────────────────────────────────────────────────────
//
// Auto-scraped keyword sets bound to a client's content generation. Discovered
// per client from the client's niche key-topics + manual seeds (see
// keyword-scraper.ts). When active, the top-ranked keywords are merged into the
// ideation keyword pool so every generated post targets them.
//
// searchVolume / cpc are nullable — Google Autocomplete supplies neither, but
// the columns keep the store ready for volume-bearing providers so ranking can
// use real volume without a schema change. For volume-less sources, hitCount
// (how many seed queries surfaced the term) + bestPosition act as the ranking
// proxy.

export const clientKeywords = pgTable("client_keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  keyword: varchar("keyword", { length: 200 }).notNull(),
  searchVolume: integer("search_volume"),
  cpc: decimal("cpc", { precision: 10, scale: 2 }),
  source: varchar("source", { length: 32 }).notNull().default("google_autocomplete"),
  hitCount: integer("hit_count").notNull().default(1),
  bestPosition: integer("best_position"),
  isActive: boolean("is_active").notNull().default(true),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("client_keywords_client_keyword_idx").on(table.clientId, table.keyword),
  index("client_keywords_client_active_idx").on(table.clientId, table.isActive),
]);

// ─── peptide_location_targets ─────────────────────────────────────────────────
//
// Peptides-only programmatic long-tail location pages. One row = one
// (blog compound × client location) page. A campaign builds the matrix as
// "pending" rows; a daily drip cron generates up to the client's
// locationPagesPerDay per blog as full unique articles through the normal
// generator, so aggressive coverage rolls out slowly rather than as a burst of
// thin doorway pages.

export const peptideLocationTargets = pgTable("peptide_location_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id")
    .notNull()
    .references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  compound: varchar("compound", { length: 120 }).notNull(),
  location: varchar("location", { length: 160 }).notNull(),
  // Optional dosage ('' = none). Part of the uniqueness key.
  dosage: varchar("dosage", { length: 40 }).notNull().default(""),
  // Templated title used as the generation topic (query-targeted).
  title: varchar("title", { length: 500 }).notNull(),
  // "pending" | "generated" | "failed"
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  generatedPostId: uuid("generated_post_id").references(() => generatedPosts.id, {
    onDelete: "set null",
  }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  generatedAt: timestamp("generated_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("peptide_location_targets_unique_idx").on(
    table.blogId,
    table.compound,
    table.dosage,
    table.location,
  ),
  index("peptide_location_targets_blog_status_idx").on(table.blogId, table.status),
  index("peptide_location_targets_client_idx").on(table.clientId),
]);

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one }) => ({
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  blogs: many(blogs),
  users: many(users),
  messages: many(messages),
  reports: many(reports),
  activityLogs: many(activityLog),
  knowledgeDocuments: many(knowledgeDocuments),
}));

export const blogsRelations = relations(blogs, ({ one, many }) => ({
  client: one(clients, { fields: [blogs.clientId], references: [clients.id] }),
  seoScans: many(seoScans),
  seoIssues: many(seoIssues),
  postVerifications: many(postVerifications),
  thirdPartyData: many(seoThirdPartyData),
  generatedPosts: many(generatedPosts),
  knowledgeDocuments: many(knowledgeDocuments),
  styleProfile: one(styleProfiles, {
    fields: [blogs.id],
    references: [styleProfiles.blogId],
  }),
}));

export const styleProfilesRelations = relations(styleProfiles, ({ one }) => ({
  blog: one(blogs, { fields: [styleProfiles.blogId], references: [blogs.id] }),
}));

export const knowledgeDocumentsRelations = relations(knowledgeDocuments, ({ one }) => ({
  client: one(clients, { fields: [knowledgeDocuments.clientId], references: [clients.id] }),
  blog: one(blogs, { fields: [knowledgeDocuments.blogId], references: [blogs.id] }),
  uploadedByUser: one(users, { fields: [knowledgeDocuments.uploadedBy], references: [users.id] }),
}));

export const generatedPostsRelations = relations(generatedPosts, ({ one }) => ({
  blog: one(blogs, { fields: [generatedPosts.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [generatedPosts.clientId], references: [clients.id] }),
}));

export const seoScansRelations = relations(seoScans, ({ one, many }) => ({
  blog: one(blogs, { fields: [seoScans.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [seoScans.clientId], references: [clients.id] }),
  issues: many(seoIssues),
}));

export const seoIssuesRelations = relations(seoIssues, ({ one }) => ({
  scan: one(seoScans, { fields: [seoIssues.scanId], references: [seoScans.id] }),
  blog: one(blogs, { fields: [seoIssues.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [seoIssues.clientId], references: [clients.id] }),
  approvedByUser: one(users, { fields: [seoIssues.approvedBy], references: [users.id] }),
}));

export const postVerificationsRelations = relations(postVerifications, ({ one }) => ({
  blog: one(blogs, { fields: [postVerifications.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [postVerifications.clientId], references: [clients.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  client: one(clients, { fields: [messages.clientId], references: [clients.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  client: one(clients, { fields: [reports.clientId], references: [clients.id] }),
}));

export const seoThirdPartyDataRelations = relations(seoThirdPartyData, ({ one }) => ({
  blog: one(blogs, { fields: [seoThirdPartyData.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [seoThirdPartyData.clientId], references: [clients.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  user: one(users, { fields: [activityLog.userId], references: [users.id] }),
  client: one(clients, { fields: [activityLog.clientId], references: [clients.id] }),
}));

// ─── app_settings ────────────────────────────────────────────────────────────
// Operator-global key/value settings (e.g. which model powers content
// generation vs SEO fixes). One row per key; values are stored as text and
// parsed by typed getters in @/lib/settings/app-settings.
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── link_events ─────────────────────────────────────────────────────────────
// Append-only traffic log for netgrid-tracked links on published posts:
//   type "view"      → a tracking-pixel hit (page view)
//   type "cta_click" → the CTA redirect (/r/{postId}) was followed
// Not FK-constrained so the log survives post/blog deletion. Ids are stored
// loosely (nullable) for the same reason.
export const linkEvents = pgTable("link_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id"),
  blogId: uuid("blog_id"),
  clientId: uuid("client_id"),
  type: varchar("type", { length: 16 }).notNull(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("link_events_post_idx").on(table.postId, table.type),
  index("link_events_blog_idx").on(table.blogId, table.type),
  index("link_events_client_idx").on(table.clientId, table.type),
  index("link_events_created_idx").on(table.createdAt),
]);