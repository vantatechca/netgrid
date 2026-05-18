-- Drop hosting + registrar credential storage from blogs.
--
-- These 8 columns stored hosting-provider and domain-registrar login
-- credentials per blog. The product no longer manages hosting or
-- registrar access — those are out of scope for the blog-automation
-- platform. Dropping the columns removes a long-standing source of
-- validation errors ("8 fields need attention" on the blog form) and
-- a meaningful security liability (plaintext credentials at rest).
--
-- IF EXISTS-guarded so the migration is safe to re-run on environments
-- where the columns were already removed.

ALTER TABLE "blogs" DROP COLUMN IF EXISTS "hosting_provider";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "hosting_login_url";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "hosting_username";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "hosting_password";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "registrar";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "registrar_login_url";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "registrar_username";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "registrar_password";
