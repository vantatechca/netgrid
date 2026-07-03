-- Operator-global key/value settings. First use: which model powers content
-- generation ("content_model": auto | deepseek | claude) and which Claude model
-- powers SEO fixes/reports ("fix_model"). One row per key. Idempotent.

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key"        varchar(64) PRIMARY KEY,
  "value"      text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
