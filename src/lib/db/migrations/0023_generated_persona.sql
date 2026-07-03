-- Content-config rebuild, Phase 3: optional LLM-generated per-blog persona.
-- generated_persona (jsonb) holds the generated voice {persona, register,
-- example paragraphs, tone}; when present, composeForPost uses it for the voice
-- slots instead of the library voice. generated_persona_seed keeps the
-- operator's seed inputs for regeneration. Null → unchanged (library voice).
-- Idempotent so it's safe to re-run.

ALTER TABLE "style_profiles" ADD COLUMN IF NOT EXISTS "generated_persona" jsonb;
ALTER TABLE "style_profiles" ADD COLUMN IF NOT EXISTS "generated_persona_seed" text;
