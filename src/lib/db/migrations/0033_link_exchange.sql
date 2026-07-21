-- Link Exchange / ABC reciprocal linking engine.
--
-- Orchestrates cross-site body-text links across the blogs netgrid manages,
-- structured as directed ABC loops (A→B→C→A) so no two sites link directly to
-- each other. Participation is opt-in per client. Loops group topically
-- related (same-niche) sites; each directed edge records the anchor and where
-- the link was placed. Idempotent — safe to replay.

-- Per-client opt-in. Off by default: a client only joins the network when
-- explicitly enabled.
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "link_exchange_enabled" boolean NOT NULL DEFAULT false;

-- A single ABC loop (a directed cycle of topically related sites).
CREATE TABLE IF NOT EXISTS "link_exchange_loops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "niche" varchar(255),
  "size" integer NOT NULL DEFAULT 3,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "link_exchange_loops_status_idx"
  ON "link_exchange_loops" ("status");

-- One directed link A→B within a loop. Anchor is allocated at build time;
-- target_url + placement fields are filled when the link is actually injected.
CREATE TABLE IF NOT EXISTS "link_exchange_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "loop_id" uuid NOT NULL REFERENCES "link_exchange_loops"("id") ON DELETE CASCADE,
  "source_blog_id" uuid NOT NULL REFERENCES "blogs"("id") ON DELETE CASCADE,
  "target_blog_id" uuid NOT NULL REFERENCES "blogs"("id") ON DELETE CASCADE,
  "position" integer NOT NULL DEFAULT 0,
  "anchor_text" varchar(255) NOT NULL,
  "anchor_type" varchar(16) NOT NULL,
  "target_url" varchar(1000),
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "placed_in_post_id" uuid REFERENCES "generated_posts"("id") ON DELETE SET NULL,
  "placed_at" timestamp,
  "failure_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- A directed edge between an ordered pair is unique; combined with the ABC
-- build rule (never create both A→B and B→A) this blocks direct reciprocity.
CREATE UNIQUE INDEX IF NOT EXISTS "link_exchange_edges_pair_idx"
  ON "link_exchange_edges" ("source_blog_id", "target_blog_id");
CREATE INDEX IF NOT EXISTS "link_exchange_edges_loop_idx"
  ON "link_exchange_edges" ("loop_id");
CREATE INDEX IF NOT EXISTS "link_exchange_edges_status_idx"
  ON "link_exchange_edges" ("status");
CREATE INDEX IF NOT EXISTS "link_exchange_edges_source_idx"
  ON "link_exchange_edges" ("source_blog_id");
