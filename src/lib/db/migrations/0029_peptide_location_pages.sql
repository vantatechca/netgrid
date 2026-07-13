-- Peptides-only programmatic long-tail location pages.
--
-- Each target is one (blog compound × client location) page. A campaign builds
-- the matrix into peptide_location_targets (status 'pending'), and a daily drip
-- cron generates up to location_pages_per_day of them per blog as full unique
-- articles through the normal generator — so aggressive location coverage rolls
-- out slowly instead of as a spammy burst of thin doorway pages.

-- Per-client target locations (newline/comma separated) + campaign controls.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "peptide_locations" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "location_campaign_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "location_pages_per_day" integer NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS "peptide_location_targets" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "blog_id"           uuid NOT NULL REFERENCES "blogs"("id") ON DELETE CASCADE,
  "client_id"         uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "compound"          varchar(120) NOT NULL,
  "location"          varchar(160) NOT NULL,
  -- Templated title used as the generation topic (query-targeted).
  "title"             varchar(500) NOT NULL,
  -- 'pending' | 'generated' | 'failed'
  "status"            varchar(16) NOT NULL DEFAULT 'pending',
  "generated_post_id" uuid REFERENCES "generated_posts"("id") ON DELETE SET NULL,
  "failure_reason"    text,
  "created_at"        timestamp NOT NULL DEFAULT now(),
  "generated_at"      timestamp,
  "updated_at"        timestamp NOT NULL DEFAULT now()
);

-- One page per (blog, compound, location); re-building the matrix is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS "peptide_location_targets_unique_idx"
  ON "peptide_location_targets" ("blog_id", "compound", "location");
CREATE INDEX IF NOT EXISTS "peptide_location_targets_blog_status_idx"
  ON "peptide_location_targets" ("blog_id", "status");
CREATE INDEX IF NOT EXISTS "peptide_location_targets_client_idx"
  ON "peptide_location_targets" ("client_id");
