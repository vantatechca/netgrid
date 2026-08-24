-- Local keyword-targeted content — phase 1 (schema only).
--
-- Adds a per-blog city/region/brand so a blog can be targeted at a specific
-- market, and a keyword-target ledger that pairs a blog's city with its own
-- scraped keywords (client_keywords). One ledger row = one candidate
-- "[keyword] in [city]" post. See docs/local-keyword-content-plan.md.
--
-- city is nullable and is the feature's on/off switch: a blog with no city
-- takes today's ideation path unchanged (see runGenerateAndPublish). Cities
-- are assigned manually by the operator — the domain is not a reliable
-- source (pizzeriacrosta.ca carries no city at all) — so nothing here
-- auto-populates it.

ALTER TABLE "blogs" ADD COLUMN IF NOT EXISTS "city" varchar(120);
ALTER TABLE "blogs" ADD COLUMN IF NOT EXISTS "region" varchar(120);
ALTER TABLE "blogs" ADD COLUMN IF NOT EXISTS "country_code" varchar(2);
-- Display name for the blog's own store, e.g. "Montreal Peptides". Null falls
-- back to a domain-derived label at read time (see content/brand.ts).
ALTER TABLE "blogs" ADD COLUMN IF NOT EXISTS "brand_name" varchar(160);

DO $$ BEGIN
  CREATE TYPE "keyword_target_status" AS ENUM ('pending', 'generating', 'generated', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- One row per (blog, keyword, city) candidate. Built by
-- buildKeywordTargetsForBlog() from the blog's active client_keywords
-- whenever the blog has a city; claimed by runAutoPublishCron in priority
-- order, one claim per due blog per run.
CREATE TABLE IF NOT EXISTS "blog_keyword_targets" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "blog_id"            uuid NOT NULL REFERENCES "blogs"("id") ON DELETE CASCADE,
  "client_id"          uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "keyword"            varchar(255) NOT NULL,
  -- Snapshot of blogs.city at build time — kept even if the blog's city is
  -- later reassigned, so historical rows still describe what was targeted.
  "city"               varchar(120) NOT NULL,
  "topic_title"        varchar(500) NOT NULL,
  "status"             "keyword_target_status" NOT NULL DEFAULT 'pending',
  -- Rank snapshot at build time (lower = higher priority). Real search
  -- volume once the DataForSEO corpus lands; the Autocomplete popularity
  -- proxy (hitCount/bestPosition ordering) until then.
  "priority"           integer NOT NULL DEFAULT 0,
  "keyword_source"     varchar(32) NOT NULL DEFAULT 'google_autocomplete',
  "search_volume"      integer,
  "generated_post_id"  uuid REFERENCES "generated_posts"("id") ON DELETE SET NULL,
  "failure_reason"     text,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  "updated_at"         timestamp NOT NULL DEFAULT now(),
  "generated_at"       timestamp
);

-- Idempotency key — rebuilding the matrix for a blog never duplicates a row.
CREATE UNIQUE INDEX IF NOT EXISTS "blog_keyword_targets_unique_idx"
  ON "blog_keyword_targets" ("blog_id", "keyword", "city");
-- The claim query: best-ranked pending row for a due blog.
CREATE INDEX IF NOT EXISTS "blog_keyword_targets_blog_status_priority_idx"
  ON "blog_keyword_targets" ("blog_id", "status", "priority");
CREATE INDEX IF NOT EXISTS "blog_keyword_targets_client_idx"
  ON "blog_keyword_targets" ("client_id");
