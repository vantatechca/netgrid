-- Remove renewals tracking. App focuses on blog automation, not domain
-- renewal management.

-- 1. Drop the renewal_alerts table.
DROP TABLE IF EXISTS "renewal_alerts";

-- 2. Drop expiry columns from blogs.
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "domain_expiry_date";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "hosting_expiry_date";
ALTER TABLE "blogs" DROP COLUMN IF EXISTS "ssl_expiry_date";

-- 3. Drop the now-unused enum types.
DROP TYPE IF EXISTS "renewal_type";
DROP TYPE IF EXISTS "alert_level";
