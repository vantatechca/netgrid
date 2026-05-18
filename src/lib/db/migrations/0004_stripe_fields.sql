ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "stripe_hosted_invoice_url" text;
