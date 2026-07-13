-- Auto-scraped, per-client keyword sets bound to content generation.
--
-- Keywords are discovered per client (see keyword-scraper.ts) and, when active,
-- merged into the ideation keyword pool so every generated post targets them.
-- search_volume / cpc are nullable — Google Autocomplete supplies neither, but
-- the columns keep the store ready for volume-bearing providers (Bing /
-- DataForSEO) so ranking can switch to real volume without a schema change.

-- Per-client manual seed terms (newline/comma separated) fed to the scraper
-- alongside the client's niche key-topics.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "keyword_seeds" text;

CREATE TABLE IF NOT EXISTS "client_keywords" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"     uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "keyword"       varchar(200) NOT NULL,
  -- Real monthly search volume when a volume-bearing provider is used; NULL for
  -- Autocomplete-only.
  "search_volume" integer,
  -- Cost-per-click (USD) when available; NULL for Autocomplete-only.
  "cpc"           numeric(10, 2),
  -- Discovery source, e.g. "google_autocomplete".
  "source"        varchar(32) NOT NULL DEFAULT 'google_autocomplete',
  -- Popularity proxy for volume-less sources: how many seed queries surfaced
  -- this term.
  "hit_count"     integer NOT NULL DEFAULT 1,
  -- Best (lowest) autocomplete position seen across seed queries; lower = more
  -- prominent. NULL when not applicable.
  "best_position" integer,
  "is_active"     boolean NOT NULL DEFAULT true,
  "fetched_at"    timestamp NOT NULL DEFAULT now(),
  "created_at"    timestamp NOT NULL DEFAULT now(),
  "updated_at"    timestamp NOT NULL DEFAULT now()
);

-- One row per (client, keyword); re-scrapes upsert on this.
CREATE UNIQUE INDEX IF NOT EXISTS "client_keywords_client_keyword_idx"
  ON "client_keywords" ("client_id", "keyword");
CREATE INDEX IF NOT EXISTS "client_keywords_client_active_idx"
  ON "client_keywords" ("client_id", "is_active");
