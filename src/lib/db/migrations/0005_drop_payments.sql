-- Remove all billing / invoicing / Stripe state.
-- The app focuses on blog automation only.

-- 1. Drop invoices table (cascades any FK references via cascade delete on
--    activity_log entries that point at it; activity_log.entity_id is just a
--    text/uuid label, not a real FK, so nothing else needs adjusting here).
DROP TABLE IF EXISTS "invoices";

-- 2. Remove billing/Stripe columns from clients
ALTER TABLE "clients" DROP COLUMN IF EXISTS "billing_type";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "billing_amount";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "setup_fee";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "setup_fee_paid";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "billing_start_date";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "next_billing_date";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "billing_status";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "stripe_customer_id";

-- 3. Drop the now-unused index
DROP INDEX IF EXISTS "clients_billing_status_idx";

-- 4. Drop billing/invoice enum types
DROP TYPE IF EXISTS "billing_type";
DROP TYPE IF EXISTS "billing_status";
DROP TYPE IF EXISTS "invoice_type";
DROP TYPE IF EXISTS "invoice_status";
