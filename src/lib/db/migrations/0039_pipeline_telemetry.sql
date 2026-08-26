-- Pipeline telemetry (T22). Four append-only tables that replace the ~131
-- console-only failure paths and the cron counters that currently die in a
-- per-shard Render log.
--
--   cron_runs         one row per cron invocation, with its counter set
--   pipeline_errors   one row per typed failure, queryable by code/blog/run
--   alert_log         audit trail of every alert the evaluator tried to send
--   alert_suppression per-key cooldown claim (PK gives an atomic upsert)
--
-- Not FK-constrained, same convention as link_events (0026): a telemetry
-- write must never fail because a blog or client row moved underneath it.
-- Fully idempotent — a replay is a no-op.

CREATE TABLE IF NOT EXISTS "cron_runs" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job"          varchar(64) NOT NULL,
  "shard_index"  integer,
  "shard_count"  integer,
  "started_at"   timestamp NOT NULL,
  "finished_at"  timestamp NOT NULL DEFAULT now(),
  "duration_ms"  integer NOT NULL,
  "ok"           boolean NOT NULL DEFAULT true,
  "counters"     jsonb NOT NULL,
  "error_count"  integer NOT NULL DEFAULT 0,
  "error_sample" jsonb,
  "fatal_error"  text,
  "created_at"   timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cron_runs_job_started_idx" ON "cron_runs" ("job", "started_at");
CREATE INDEX IF NOT EXISTS "cron_runs_started_at_idx" ON "cron_runs" ("started_at");

CREATE TABLE IF NOT EXISTS "pipeline_errors" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id"     uuid,
  "job"        varchar(64) NOT NULL,
  "site"       varchar(64) NOT NULL,
  "code"       varchar(64) NOT NULL,
  "severity"   varchar(16) NOT NULL DEFAULT 'error',
  "blog_id"    uuid,
  "client_id"  uuid,
  "post_id"    uuid,
  "message"    text NOT NULL,
  "context"    jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pipeline_errors_created_at_idx" ON "pipeline_errors" ("created_at");
CREATE INDEX IF NOT EXISTS "pipeline_errors_code_created_idx" ON "pipeline_errors" ("code", "created_at");
CREATE INDEX IF NOT EXISTS "pipeline_errors_blog_id_idx" ON "pipeline_errors" ("blog_id");
CREATE INDEX IF NOT EXISTS "pipeline_errors_run_id_idx" ON "pipeline_errors" ("run_id");

CREATE TABLE IF NOT EXISTS "alert_log" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "alert_key"      varchar(160) NOT NULL,
  "severity"       varchar(16) NOT NULL,
  "subject"        varchar(300) NOT NULL,
  "body"           text NOT NULL,
  "delivered"      boolean NOT NULL DEFAULT false,
  "delivery_error" text,
  "created_at"     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "alert_log_key_created_idx" ON "alert_log" ("alert_key", "created_at");
CREATE INDEX IF NOT EXISTS "alert_log_created_idx" ON "alert_log" ("created_at");

-- alert_key is the PRIMARY KEY on purpose: it makes the conditional upsert in
-- pipeline-alerts.ts atomic across the four concurrent auto-publish shards
-- without a transaction (the neon-http driver has none).
CREATE TABLE IF NOT EXISTS "alert_suppression" (
  "alert_key"        varchar(160) PRIMARY KEY,
  "suppressed_until" timestamp NOT NULL,
  "updated_at"       timestamp NOT NULL DEFAULT now()
);
