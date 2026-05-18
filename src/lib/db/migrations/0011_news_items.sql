-- News items — cached headlines fetched from Google News RSS (and optional
-- NewsAPI / GNews fallbacks) keyed by vertical. Drives news-aware topic
-- ideation when the auto-publish cron generates posts for verticals whose
-- lifecycle is "news_cycle" or "hybrid".
--
-- Rows are immutable. The refresh cron upserts on (vertical_key, link) so
-- duplicates from multiple queries on the same vertical collapse. A nightly
-- prune step removes rows older than 30 days.

CREATE TABLE IF NOT EXISTS "news_items" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vertical_key"        varchar(64)  NOT NULL,
  "query"               varchar(256) NOT NULL,
  "source"              varchar(32)  NOT NULL,
  "publisher"           varchar(128),
  "title"               varchar(512) NOT NULL,
  "link"                varchar(1024) NOT NULL,
  "snippet"             text,
  "language"            varchar(8),
  "country"             varchar(8),
  "published_at"        timestamp,
  "fetched_at"          timestamp NOT NULL DEFAULT now(),
  "used_in_ideation"    boolean   NOT NULL DEFAULT false,
  "raw"                 jsonb
);

CREATE INDEX IF NOT EXISTS "news_items_vertical_idx"
  ON "news_items" ("vertical_key");

CREATE INDEX IF NOT EXISTS "news_items_fetched_at_idx"
  ON "news_items" ("fetched_at");

CREATE INDEX IF NOT EXISTS "news_items_published_at_idx"
  ON "news_items" ("published_at");

CREATE UNIQUE INDEX IF NOT EXISTS "news_items_vertical_link_uk"
  ON "news_items" ("vertical_key", "link");
