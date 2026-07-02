-- Content-config rebuild, Phase 0: the editable per-niche generation config.
-- Rows are SEEDED from the currently-hardcoded rules in content-generator.ts
-- (NICHE_CONTEXTS + getNicheRequirements) via the "Sync from code" admin action,
-- so ops can review/edit them in the /content-studio/niches screen. Generation
-- still uses the code path in Phase 0 — this table is a shadow copy until the
-- composer is switched to read from it. Idempotent so it's safe to re-run.

CREATE TABLE IF NOT EXISTS "niches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(100) NOT NULL,
  "label" varchar(255) NOT NULL,
  "industry" varchar(255) NOT NULL,
  "default_audience" text,
  "default_brand_voice" text,
  "content_style" text,
  "key_topics" jsonb,
  "requirements" text,
  "disclaimers" jsonb,
  "word_band_min" integer,
  "word_band_max" integer,
  "source" varchar(20) NOT NULL DEFAULT 'seed',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "niches_key_unique" UNIQUE ("key")
);

CREATE INDEX IF NOT EXISTS "niches_key_idx" ON "niches" USING btree ("key");
