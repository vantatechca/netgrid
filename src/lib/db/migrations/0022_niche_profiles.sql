-- Auto-generated niche profiles for client niches not hardcoded in
-- src/lib/content/libraries/niches.ts. One row per niche, created once via an
-- LLM call when a client with a new niche is added, then cached in memory and
-- reused like the built-in niches.

CREATE TABLE IF NOT EXISTS "niche_profiles" (
  "key"            varchar(80) PRIMARY KEY,
  "name"           varchar(160) NOT NULL,
  "audience"       text NOT NULL,
  "brand_voice"    text NOT NULL,
  "content_style"  text NOT NULL,
  "requirements"   text NOT NULL,
  "key_topics"     text[] NOT NULL,
  "primary_terms"  text[] NOT NULL,
  "adjacent_terms" text[] NOT NULL,
  "source"         varchar(24) NOT NULL DEFAULT 'generated',
  "created_at"     timestamp NOT NULL DEFAULT now()
);
