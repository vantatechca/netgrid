-- Style profiles — the per-blog locked configuration that makes 2000 peptide
-- blogs read like 2000 different writers. Created once at blog creation by the
-- 14-phase assignment algorithm; never regenerated automatically.
--
-- One row per blog, one blog per row. Soft 1:1; we don't ON DELETE CASCADE the
-- blogs side because we want the profile to survive a soft-delete of the blog
-- (status='decommissioned' rather than a hard delete) so the network state
-- view stays consistent.

CREATE TABLE IF NOT EXISTS "style_profiles" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "blog_id"                  uuid NOT NULL REFERENCES "blogs"("id") ON DELETE CASCADE,
  "niche_key"                varchar(64) NOT NULL DEFAULT 'peptides',
  "sub_niche_id"             integer NOT NULL,
  "voice_id"                 integer NOT NULL,
  "skeleton_id"              integer NOT NULL,
  "cadence_id"               integer NOT NULL,
  "quirks"                   integer[] NOT NULL,
  "schema_id"                integer NOT NULL,
  "tag_set_id"               integer NOT NULL,
  "citation_style_id"        integer NOT NULL,
  "structural_pool"          integer[] NOT NULL,
  "compliance_phrase_ids"    integer[] NOT NULL,
  "compliance_placement"     varchar(32) NOT NULL,
  "word_band_min"            integer NOT NULL,
  "word_band_max"            integer NOT NULL,
  "scrubber_strictness"      varchar(16) NOT NULL DEFAULT 'standard',
  "primary_compounds"        text[] NOT NULL,
  "secondary_compounds"      text[] NOT NULL,
  "assignment_seed"          varchar(64),
  "min_hamming_at_assign"    integer,
  "created_at"               timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "style_profiles_blog_id_unique" UNIQUE ("blog_id")
);

CREATE INDEX IF NOT EXISTS "style_profiles_blog_id_idx" ON "style_profiles" ("blog_id");
CREATE INDEX IF NOT EXISTS "style_profiles_sub_niche_idx" ON "style_profiles" ("sub_niche_id");
CREATE INDEX IF NOT EXISTS "style_profiles_voice_idx" ON "style_profiles" ("voice_id");

-- Per-post scrubber audit trail. JSONB so we can dashboard violation patterns
-- via GROUP BY on the inner keys without schema-locking the report shape early.
ALTER TABLE "generated_posts"
  ADD COLUMN IF NOT EXISTS "scrubber_report" jsonb,
  ADD COLUMN IF NOT EXISTS "flagged_for_review" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "generated_posts_flagged_idx"
  ON "generated_posts" ("flagged_for_review")
  WHERE "flagged_for_review" = true;
