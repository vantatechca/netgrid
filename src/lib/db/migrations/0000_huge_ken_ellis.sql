CREATE TYPE "public"."alert_level" AS ENUM('info', 'warning', 'urgent', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('active', 'overdue', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."billing_type" AS ENUM('one_time', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."blog_status" AS ENUM('active', 'paused', 'setup', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."check_type" AS ENUM('scheduled', 'manual');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('onboarding', 'active', 'paused', 'churned');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('setup', 'recurring', 'custom');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('critical', 'warning', 'notice');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('detected', 'queued', 'approved', 'applied', 'verified', 'dismissed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('wordpress', 'shopify');--> statement-breakpoint
CREATE TYPE "public"."renewal_type" AS ENUM('domain', 'hosting', 'ssl');--> statement-breakpoint
CREATE TYPE "public"."sender_role" AS ENUM('admin', 'client', 'system');--> statement-breakpoint
CREATE TYPE "public"."seo_category" AS ENUM('meta', 'content', 'technical', 'links', 'images', 'schema', 'performance');--> statement-breakpoint
CREATE TYPE "public"."seo_plugin" AS ENUM('yoast', 'rankmath', 'none');--> statement-breakpoint
CREATE TYPE "public"."seo_trend" AS ENUM('improving', 'stable', 'declining');--> statement-breakpoint
CREATE TYPE "public"."third_party_source" AS ENUM('ahrefs', 'semrush', 'moz');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'client');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"client_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"domain" varchar(255) NOT NULL,
	"platform" "platform" DEFAULT 'wordpress' NOT NULL,
	"wp_url" varchar(500),
	"wp_username" varchar(255),
	"wp_app_password" varchar(255),
	"seo_plugin" "seo_plugin" DEFAULT 'none',
	"shopify_store_url" varchar(500),
	"shopify_admin_api_token" varchar(500),
	"shopify_api_version" varchar(20) DEFAULT '2024-07',
	"shopify_blog_id" varchar(50),
	"hosting_provider" varchar(255),
	"hosting_login_url" varchar(500),
	"hosting_username" varchar(255),
	"hosting_password" varchar(255),
	"registrar" varchar(255),
	"registrar_login_url" varchar(500),
	"registrar_username" varchar(255),
	"registrar_password" varchar(255),
	"domain_expiry_date" date,
	"hosting_expiry_date" date,
	"ssl_expiry_date" date,
	"posting_frequency" varchar(50),
	"posting_frequency_days" integer,
	"last_post_verified_at" timestamp,
	"last_post_title" varchar(500),
	"current_seo_score" integer,
	"last_seo_scan_at" timestamp,
	"status" "blog_status" DEFAULT 'setup',
	"notes_internal" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"niche" varchar(255),
	"total_blogs_target" integer DEFAULT 0,
	"billing_type" "billing_type" DEFAULT 'monthly',
	"billing_amount" numeric(10, 2) DEFAULT '0',
	"setup_fee" numeric(10, 2) DEFAULT '0',
	"setup_fee_paid" boolean DEFAULT false,
	"billing_start_date" date,
	"next_billing_date" date,
	"billing_status" "billing_status" DEFAULT 'active',
	"notes_internal" text,
	"status" "client_status" DEFAULT 'onboarding',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"type" "invoice_type" DEFAULT 'recurring',
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'CAD',
	"description" text,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'draft',
	"paid_at" timestamp,
	"paid_method" varchar(100),
	"reminder_sent_at" timestamp,
	"reminders_count" integer DEFAULT 0,
	"notes_internal" text,
	"visible_to_client" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"sender_id" uuid,
	"sender_role" "sender_role" NOT NULL,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"attachments" jsonb,
	"read_by_client" boolean DEFAULT false,
	"read_by_admin" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"check_type" "check_type" DEFAULT 'scheduled',
	"latest_post_date" timestamp,
	"latest_post_title" varchar(500),
	"latest_post_url" varchar(1000),
	"posts_in_period" integer DEFAULT 0,
	"expected_posts" integer DEFAULT 0,
	"on_schedule" boolean DEFAULT true,
	"days_since_last_post" integer,
	"alert_triggered" boolean DEFAULT false,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"renewal_type" "renewal_type" NOT NULL,
	"expiry_date" date NOT NULL,
	"days_until_expiry" integer,
	"alert_level" "alert_level" DEFAULT 'info',
	"acknowledged" boolean DEFAULT false,
	"renewed" boolean DEFAULT false,
	"renewed_until" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"title" varchar(255),
	"summary_html" text,
	"overall_seo_trend" "seo_trend",
	"avg_seo_score" integer,
	"total_posts_published" integer,
	"total_issues_fixed" integer,
	"blogs_on_schedule" integer,
	"blogs_off_schedule" integer,
	"highlights" jsonb,
	"concerns" jsonb,
	"raw_data" jsonb,
	"visible_to_client" boolean DEFAULT false,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seo_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scan_id" uuid NOT NULL,
	"blog_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"page_url" varchar(1000),
	"category" "seo_category" NOT NULL,
	"severity" "issue_severity" NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"suggested_fix" text,
	"fix_payload" jsonb,
	"status" "issue_status" DEFAULT 'detected',
	"approved_by" uuid,
	"approved_at" timestamp,
	"applied_at" timestamp,
	"verified_at" timestamp,
	"failure_reason" text,
	"auto_fixable" boolean DEFAULT false,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seo_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"overall_score" integer NOT NULL,
	"meta_score" integer NOT NULL,
	"content_score" integer NOT NULL,
	"technical_score" integer NOT NULL,
	"link_score" integer NOT NULL,
	"image_score" integer NOT NULL,
	"pages_crawled" integer DEFAULT 0,
	"issues_found" integer DEFAULT 0,
	"critical_issues" integer DEFAULT 0,
	"warnings" integer DEFAULT 0,
	"notices" integer DEFAULT 0,
	"raw_data" jsonb,
	"scan_duration_ms" integer,
	"scanned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_third_party_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"source" "third_party_source" NOT NULL,
	"domain_authority" integer,
	"backlinks_total" integer,
	"referring_domains" integer,
	"organic_keywords" integer,
	"organic_traffic_est" integer,
	"top_keywords" jsonb,
	"raw_response" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"client_id" uuid,
	"avatar_url" text,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_verifications" ADD CONSTRAINT "post_verifications_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_verifications" ADD CONSTRAINT "post_verifications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_alerts" ADD CONSTRAINT "renewal_alerts_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_alerts" ADD CONSTRAINT "renewal_alerts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_issues" ADD CONSTRAINT "seo_issues_scan_id_seo_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."seo_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_issues" ADD CONSTRAINT "seo_issues_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_issues" ADD CONSTRAINT "seo_issues_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_issues" ADD CONSTRAINT "seo_issues_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_scans" ADD CONSTRAINT "seo_scans_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_scans" ADD CONSTRAINT "seo_scans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_third_party_data" ADD CONSTRAINT "seo_third_party_data_blog_id_blogs_id_fk" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_third_party_data" ADD CONSTRAINT "seo_third_party_data_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_user_id_idx" ON "activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_log_client_id_idx" ON "activity_log" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "activity_log_created_at_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blogs_domain_idx" ON "blogs" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "blogs_client_id_idx" ON "blogs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "blogs_status_idx" ON "blogs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_billing_status_idx" ON "clients" USING btree ("billing_status");--> statement-breakpoint
CREATE INDEX "invoices_client_id_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_client_id_idx" ON "messages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "post_verifications_blog_id_idx" ON "post_verifications" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "post_verifications_client_id_idx" ON "post_verifications" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "renewal_alerts_blog_id_idx" ON "renewal_alerts" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "renewal_alerts_client_id_idx" ON "renewal_alerts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "renewal_alerts_alert_level_idx" ON "renewal_alerts" USING btree ("alert_level");--> statement-breakpoint
CREATE INDEX "reports_client_id_idx" ON "reports" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "seo_issues_blog_id_idx" ON "seo_issues" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "seo_issues_client_id_idx" ON "seo_issues" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "seo_issues_status_idx" ON "seo_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seo_issues_severity_idx" ON "seo_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "seo_scans_blog_id_idx" ON "seo_scans" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "seo_scans_client_id_idx" ON "seo_scans" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "seo_scans_scanned_at_idx" ON "seo_scans" USING btree ("scanned_at");--> statement-breakpoint
CREATE INDEX "seo_third_party_blog_id_idx" ON "seo_third_party_data" USING btree ("blog_id");--> statement-breakpoint
CREATE INDEX "seo_third_party_client_id_idx" ON "seo_third_party_data" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_client_id_idx" ON "users" USING btree ("client_id");