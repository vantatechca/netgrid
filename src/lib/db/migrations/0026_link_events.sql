-- Traffic log for netgrid-tracked links on published posts:
--   type 'view'      → tracking-pixel hit (page view)
--   type 'cta_click' → the CTA redirect (/r/{postId}) was followed
-- Append-only, not FK-constrained so it survives post/blog deletion. Idempotent.

CREATE TABLE IF NOT EXISTS "link_events" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id"    uuid,
  "blog_id"    uuid,
  "client_id"  uuid,
  "type"       varchar(16) NOT NULL,
  "referrer"   text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "link_events_post_idx" ON "link_events" ("post_id", "type");
CREATE INDEX IF NOT EXISTS "link_events_blog_idx" ON "link_events" ("blog_id", "type");
CREATE INDEX IF NOT EXISTS "link_events_client_idx" ON "link_events" ("client_id", "type");
CREATE INDEX IF NOT EXISTS "link_events_created_idx" ON "link_events" ("created_at");
