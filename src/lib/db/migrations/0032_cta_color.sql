-- Per-client CTA button color (preset key). Applies to the injected CTA button
-- and the registration form's Register button. NULL = keep the per-blog derived
-- color.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "cta_color" varchar(20);
