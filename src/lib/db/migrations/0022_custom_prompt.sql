-- Content-config rebuild, Phase 4: optional custom generation prompt.
-- clients.custom_prompt is the client-level default; blogs.custom_prompt is a
-- per-blog override. When set, generation follows the custom prompt instead of
-- the niche/persona style; compliance disclaimers + the JSON output contract
-- stay locked. Idempotent so it's safe to re-run.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "custom_prompt" text;
ALTER TABLE "blogs" ADD COLUMN IF NOT EXISTS "custom_prompt" text;
