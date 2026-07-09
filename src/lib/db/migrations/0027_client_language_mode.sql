-- Per-client post language control.
--
-- clients.language_mode: "en" | "fr" | "en_fr" | NULL.
--   en     → every post English
--   fr     → every post French
--   en_fr  → posts alternate English / French (strict, per blog)
--   NULL   → legacy derived behaviour (niche / TLD / vertical rules)
-- The explicit toggle, when set, overrides the hardcoded niche/TLD language
-- locks (operator owns compliance).
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "language_mode" varchar(8);

-- generated_posts.language: the concrete "en"/"fr" a post was written in.
-- Recorded at generation time so bilingual clients can alternate by flipping
-- the blog's most recent post language, and for audit.
ALTER TABLE "generated_posts" ADD COLUMN IF NOT EXISTS "language" varchar(2);
