-- Shopify homepage SEO title/description — an operator-editable field per
-- blog, pushed to the store's shop-level metafields (global.title_tag /
-- global.description_tag), the same convention netgrid already writes for
-- blog articles. These render the theme's <title>/<meta name="description">
-- on the storefront's homepage template. Nullable: unset means "don't touch
-- the shop's existing metafields."

ALTER TABLE "blogs" ADD COLUMN IF NOT EXISTS "homepage_meta_title" varchar(70);
ALTER TABLE "blogs" ADD COLUMN IF NOT EXISTS "homepage_meta_description" varchar(320);
