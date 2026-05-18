ALTER TABLE "clients" ADD COLUMN "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stripe_checkout_session_id" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stripe_payment_intent_id" varchar(255);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stripe_hosted_invoice_url" text;