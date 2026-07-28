-- Per-client mini registration form injected into published posts.
--
-- When enabled, a small Name / Location / Email form is injected at the chosen
-- position(s). Submitting it POSTs to netgrid (/api/register/{blogId}), which
-- records the lead and 302-redirects the visitor to the client's own
-- registration form. Lets us track sign-up intent on blogs that just forward to
-- a client registration page.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "registration_form_enabled" boolean NOT NULL DEFAULT false;
-- Where the visitor is sent after submitting our mini form (the client's real
-- registration/sign-up page).
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "registration_redirect_url" varchar(1000);
-- "top" | "bottom" | "top_bottom"
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "registration_form_placement" varchar(40) DEFAULT 'bottom';

CREATE TABLE IF NOT EXISTS "registration_leads" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"  uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "blog_id"    uuid REFERENCES "blogs"("id") ON DELETE SET NULL,
  "post_id"    uuid REFERENCES "generated_posts"("id") ON DELETE SET NULL,
  "name"       varchar(255),
  "location"   varchar(255),
  "email"      varchar(320),
  "referrer"   varchar(2000),
  "user_agent" varchar(1000),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "registration_leads_client_created_idx"
  ON "registration_leads" ("client_id", "created_at");
CREATE INDEX IF NOT EXISTS "registration_leads_blog_idx"
  ON "registration_leads" ("blog_id");
