-- Per-client call-to-action button. When enabled, a styled button linking to
-- the client's main site / contact / registration page is appended to the
-- bottom of every published post for that client (injected into the post body
-- at generation time).

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "cta_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "cta_label" varchar(80);
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "cta_url" varchar(1000);
