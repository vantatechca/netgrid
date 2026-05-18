-- Drop shopify_api_version + shopify_blog_id from blogs.
--
-- Both were exposed on the blog form as user-editable fields, but in
-- practice nobody ever changed them and the empty defaults were tripping
-- Zod 4's optional-string validator ("Invalid input" on blank fields).
--
-- API version is now hardcoded to 2024-07 inside the Shopify client.
-- Blog ID is always auto-discovered: the client lists blogs on the
-- store and picks the first one, which matches every existing setup.
--
-- IF EXISTS-guarded so the migration is safe to re-run.

ALTER TABLE "blogs" DROP COLUMN IF EXISTS "shopify_api_version";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "shopify_blog_id";
