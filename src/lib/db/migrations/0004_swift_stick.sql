CREATE TYPE "public"."compliance_placement" AS ENUM('TOP', 'BOTTOM', 'TOP_AND_BOTTOM', 'INLINE', 'ABOUT_ONLY', 'ROTATING');--> statement-breakpoint
CREATE TYPE "public"."scrubber_strictness" AS ENUM('loose', 'standard', 'strict');--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical_key" varchar(64) NOT NULL,
	"query" varchar(256) NOT NULL,
	"source" varchar(32) NOT NULL,
	"publisher" varchar(128),
	"title" varchar(512) NOT NULL,
	"link" varchar(1024) NOT NULL,
	"snippet" text,
	"language" varchar(8),
	"country" varchar(8),
	"published_at" timestamp,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"used_in_ideation" boolean DEFAULT false NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "style_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"niche_key" varchar(64) DEFAULT 'peptides' NOT NULL,
	"sub_niche_id" integer NOT NULL,
	"voice_id" integer NOT NULL,
	"skeleton_id" integer NOT NULL,
	"cadence_id" integer NOT NULL,
	"quirks" integer[] NOT NULL,
	"schema_id" integer NOT NULL,
	"tag_set_id" integer NOT NULL,
	"citation_style_id" integer NOT NULL,
	"structural_pool" integer[] NOT NULL,
	"compliance_phrase_ids" integer[] NOT NULL,
	"compliance_placement" "compliance_placement" NOT NULL,
	"word_band_min" integer NOT NULL,
	"word_band_max" integer NOT NULL,
	"scrubber_strictness" "scrubber_strictness" DEFAULT 'standard' NOT NULL,
	"primary_compounds" text[] NOT NULL,
	"secondary_compounds" text[] NOT NULL,
	"assignment_seed" varchar(64),
	"min_hamming_at_assign" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "style_profiles_blog_id_unique" UNIQUE("blog_id")
);
--> statement-breakpoint
ALTER TABLE "invoices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "renewal_alerts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "invoices" CASCADE;--> statement-breakpoint
DROP TABLE "renewal_alerts" CASCADE;--> statement-breakpoint
DROP INDEX "clients_billing_status_idx";--> statement-breakpoint
ALTER TABLE "generated_posts" ADD COLUMN "body_image_url" text;--> statement-breakpoint
ALTER TABLE "generated_posts" ADD COLUMN "scrubber_report" jsonb;--> statement-breakpoint
ALTER TABLE "generated_posts" ADD COLUMN "flagged_for_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_items_vertical_idx" ON "news_items" USING btree ("vertical_key");--> statement-breakpoint
CREATE INDEX "news_items_fetched_at_idx" ON "news_items" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "news_items_published_at_idx" ON "news_items" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "news_items_vertical_link_uk" ON "news_items" USING btree ("vertical_key","link");--> statement-breakpoint
CREATE INDEX "style_profiles_blog_id_idx" ON "style_profiles" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "style_profiles_sub_niche_idx" ON "style_profiles" USING btree ("sub_niche_id");--> statement-breakpoint
CREATE INDEX "style_profiles_voice_idx" ON "style_profiles" USING btree ("voice_id");--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "shopify_api_version";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "shopify_blog_id";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "hosting_provider";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "hosting_login_url";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "hosting_username";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "hosting_password";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "registrar";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "registrar_login_url";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "registrar_username";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "registrar_password";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "domain_expiry_date";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "hosting_expiry_date";--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "ssl_expiry_date";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "billing_type";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "billing_amount";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "setup_fee";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "setup_fee_paid";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "billing_start_date";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "next_billing_date";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "billing_status";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
DROP TYPE "public"."alert_level";--> statement-breakpoint
DROP TYPE "public"."billing_status";--> statement-breakpoint
DROP TYPE "public"."billing_type";--> statement-breakpoint
DROP TYPE "public"."invoice_status";--> statement-breakpoint
DROP TYPE "public"."invoice_type";--> statement-breakpoint
DROP TYPE "public"."renewal_type";