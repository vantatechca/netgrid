-- DataForSEO keyword data — seamlessly folded into the EXISTING per-client
-- keyword pool (client_keywords) rather than a parallel corpus.
--
-- client_keywords.source / search_volume / cpc already existed specifically
-- so a volume-bearing provider could slot in without a schema change (see
-- 0028_client_keywords.sql's own header comment). This migration makes good
-- on that: it adds the columns DataForSEO returns beyond what Autocomplete
-- ever could, all nullable so existing Autocomplete rows are untouched.
--
-- Every consumer downstream — topActiveClientKeywords/WithMeta, ideation,
-- the local-keyword-targeting ledger (blog_keyword_targets), and the
-- per-client Keywords panel — already reads this table and already orders
-- by search_volume first. None of them need to change: the moment a
-- DataForSEO pull populates real search_volume for a keyword, ranking
-- improves automatically everywhere that keyword is used.

ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "keyword_difficulty" integer;
ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "competition" numeric(6, 4);
ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "low_top_of_page_bid" numeric(10, 2);
ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "high_top_of_page_bid" numeric(10, 2);
-- Array of {year, month, search_volume} — the trend DataForSEO returns.
ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "monthly_searches" jsonb;
ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "main_intent" varchar(32);
-- DataForSEO location_code this row was pulled for (e.g. 2840 = United
-- States). Null for Autocomplete rows, which have no location dimension —
-- client_keywords stays client-wide, matching how it's consumed today.
ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "location_code" integer;
-- The untouched API response item, so reprocessing never requires
-- re-querying (and re-paying for) the API.
ALTER TABLE "client_keywords" ADD COLUMN IF NOT EXISTS "raw" jsonb;

DO $$ BEGIN
  CREATE TYPE "dataforseo_run_status" AS ENUM ('pending', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- One row per (client, seed) pull — cost tracking and debugging, separate
-- from the keyword data itself. A run's cost is real money, unlike the free
-- Autocomplete scrape client_keywords already supports.
CREATE TABLE IF NOT EXISTS "dataforseo_runs" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"       uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "seed"            varchar(200) NOT NULL,
  "endpoint"        varchar(120) NOT NULL,
  "location_code"   integer NOT NULL,
  "language_code"   varchar(16) NOT NULL,
  "status"          "dataforseo_run_status" NOT NULL DEFAULT 'pending',
  "items_returned"  integer NOT NULL DEFAULT 0,
  "cost"            numeric(10, 4),
  "error"           text,
  "started_at"      timestamp NOT NULL DEFAULT now(),
  "finished_at"     timestamp
);

CREATE INDEX IF NOT EXISTS "dataforseo_runs_client_idx" ON "dataforseo_runs" ("client_id", "started_at");
