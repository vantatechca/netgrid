-- Content-config rebuild: client-wide "stack persona on top of the custom
-- prompt" toggle. When a client has a custom prompt, this makes each blog's
-- generated persona/voice layer ON TOP of the custom prompt instead of being
-- replaced by it. Persona stays per-blog, so every site keeps its own voice.
-- Off by default so existing custom-prompt behavior is unchanged. Idempotent so
-- it's safe to re-run.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "stack_persona" boolean DEFAULT false NOT NULL;
