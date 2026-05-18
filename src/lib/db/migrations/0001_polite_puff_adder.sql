CREATE TYPE "public"."generated_post_status" AS ENUM('pending', 'generating', 'generated', 'publishing', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."shopify_auth_mode" AS ENUM('legacy_token', 'client_credentials');--> statement-breakpoint
CREATE TABLE "generated_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"topic" varchar(500) NOT NULL,
	"keywords" jsonb,
	"title" varchar(500),
	"body" text,
	"excerpt" text,
	"meta_title" varchar(255),
	"meta_description" text,
	"featured_image_url" text,
	"word_count" integer,
	"seo_score" integer,
	"readability_score" integer,
	"brand_voice_score" integer,
	"tokens_used" integer,
	"cost_usd" numeric(10, 6),
	"status" "generated_post_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"external_post_id" varchar(100),
	"external_post_url" varchar(1000),
	"is_auto_generated" boolean DEFAULT false,
	"generated_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "shopify_auth_mode" "shopify_auth_mode" DEFAULT 'client_credentials';--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "shopify_client_id" varchar(255);--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "shopify_client_secret" varchar(500);--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "shopify_blog_handle" varchar(255);--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "shopify_granted_scopes" text;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "posts_per_day" integer;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "posting_interval_hours" integer;--> statement-breakpoint
ALTER TABLE "generated_posts" ADD CONSTRAINT "generated_posts_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_posts" ADD CONSTRAINT "generated_posts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generated_posts_blog_id_idx" ON "generated_posts" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "generated_posts_client_id_idx" ON "generated_posts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "generated_posts_status_idx" ON "generated_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "generated_posts_created_at_idx" ON "generated_posts" USING btree ("created_at");