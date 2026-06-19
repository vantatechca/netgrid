-- Where the per-client CTA button appears within each post.
-- "bottom" (default) | "top_bottom" | "top_middle_bottom".

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "cta_placement" varchar(40) DEFAULT 'bottom';
