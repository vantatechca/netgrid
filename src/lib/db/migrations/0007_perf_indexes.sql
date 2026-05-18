-- Composite indexes that turn full-table scans into index range scans for
-- the queries the dashboard, notifications API, and auto-publish cron run on
-- every page load.

-- Latest verification per blog (DISTINCT ON … ORDER BY blog_id, checked_at DESC).
-- Without this index, Postgres has to sort all rows for the dedup; with it
-- the planner can walk the index in order.
CREATE INDEX IF NOT EXISTS "post_verifications_blog_checked_idx"
  ON "post_verifications" ("blog_id", "checked_at" DESC);

-- "Did this blog already publish today?" — auto-publish + dashboard.
CREATE INDEX IF NOT EXISTS "generated_posts_blog_status_published_idx"
  ON "generated_posts" ("blog_id", "status", "published_at" DESC);

-- "Latest scan per blog" — used by dashboard (avg score) and seo page.
CREATE INDEX IF NOT EXISTS "seo_scans_blog_scanned_idx"
  ON "seo_scans" ("blog_id", "scanned_at" DESC);
