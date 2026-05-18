-- Second image per post.
--
-- The content generator now produces TWO images per post:
--
--   featured_image_url  — wide hero shot (already existed)
--   body_image_url      — deliberately differently-framed detail/close-up
--                         shot of the same topic, embedded into the body
--                         HTML at roughly the midpoint
--
-- Both are stored as data: URIs (base64-encoded PNG/JPEG). The body
-- image is also already embedded inside the `body` text column at
-- generation time — the dedicated column gives us a clean handle for
-- later use (e.g. social cards, regeneration) without HTML-parsing.

ALTER TABLE "generated_posts"
  ADD COLUMN IF NOT EXISTS "body_image_url" text;
