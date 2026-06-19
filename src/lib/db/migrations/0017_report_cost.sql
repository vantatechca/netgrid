-- Per-report generation cost. Stores the total text+image cost of the posts
-- created during a report's period, computed at report-generation time so the
-- Reports UI can show cost alongside the other period metrics. Null on reports
-- generated before this column existed.

ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "total_cost_usd" numeric(10, 6);
