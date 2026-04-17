import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  date,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "client"]);
export const clientStatusEnum = pgEnum("client_status", ["onboarding", "active", "paused", "churned"]);
export const billingTypeEnum = pgEnum("billing_type", ["one_time", "monthly", "yearly"]);
export const billingStatusEnum = pgEnum("billing_status", ["active", "overdue", "paused", "cancelled"]);
export const blogStatusEnum = pgEnum("blog_status", ["active", "paused", "setup", "decommissioned"]);
export const seoPluginEnum = pgEnum("seo_plugin", ["yoast", "rankmath", "none"]);
export const seoCategoryEnum = pgEnum("seo_category", ["meta", "content", "technical", "links", "images", "schema", "performance"]);
export const issueSeverityEnum = pgEnum("issue_severity", ["critical", "warning", "notice"]);
export const issueStatusEnum = pgEnum("issue_status", ["detected", "queued", "approved", "applied", "verified", "dismissed", "failed"]);
export const renewalTypeEnum = pgEnum("renewal_type", ["domain", "hosting", "ssl"]);
export const alertLevelEnum = pgEnum("alert_level", ["info", "warning", "urgent", "overdue"]);
export const senderRoleEnum = pgEnum("sender_role", ["admin", "client", "system"]);
export const seoTrendEnum = pgEnum("seo_trend", ["improving", "stable", "declining"]);
export const invoiceTypeEnum = pgEnum("invoice_type", ["setup", "recurring", "custom"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "overdue", "cancelled"]);
export const checkTypeEnum = pgEnum("check_type", ["scheduled", "manual"]);
export const thirdPartySourceEnum = pgEnum("third_party_source", ["ahrefs", "semrush", "moz"]);

// ─── 1. users ────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull().default("client"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  avatarUrl: text("avatar_url"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_client_id_idx").on(table.clientId),
]);

// ─── 2. clients ──────────────────────────────────────────────────────────────

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  niche: varchar("niche", { length: 255 }),
  totalBlogsTarget: integer("total_blogs_target").default(0),
  billingType: billingTypeEnum("billing_type").default("monthly"),
  billingAmount: decimal("billing_amount", { precision: 10, scale: 2 }).default("0"),
  setupFee: decimal("setup_fee", { precision: 10, scale: 2 }).default("0"),
  setupFeePaid: boolean("setup_fee_paid").default(false),
  billingStartDate: date("billing_start_date"),
  nextBillingDate: date("next_billing_date"),
  billingStatus: billingStatusEnum("billing_status").default("active"),
  notesInternal: text("notes_internal"),
  status: clientStatusEnum("status").default("onboarding"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("clients_status_idx").on(table.status),
  index("clients_billing_status_idx").on(table.billingStatus),
]);

// ─── 3. blogs ────────────────────────────────────────────────────────────────

export const blogs = pgTable("blogs", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull(),
  wpUrl: varchar("wp_url", { length: 500 }),
  wpUsername: varchar("wp_username", { length: 255 }),
  wpAppPassword: varchar("wp_app_password", { length: 255 }),
  seoPlugin: seoPluginEnum("seo_plugin").default("none"),
  hostingProvider: varchar("hosting_provider", { length: 255 }),
  hostingLoginUrl: varchar("hosting_login_url", { length: 500 }),
  hostingUsername: varchar("hosting_username", { length: 255 }),
  hostingPassword: varchar("hosting_password", { length: 255 }),
  registrar: varchar("registrar", { length: 255 }),
  registrarLoginUrl: varchar("registrar_login_url", { length: 500 }),
  registrarUsername: varchar("registrar_username", { length: 255 }),
  registrarPassword: varchar("registrar_password", { length: 255 }),
  domainExpiryDate: date("domain_expiry_date"),
  hostingExpiryDate: date("hosting_expiry_date"),
  sslExpiryDate: date("ssl_expiry_date"),
  postingFrequency: varchar("posting_frequency", { length: 50 }),
  postingFrequencyDays: integer("posting_frequency_days"),
  lastPostVerifiedAt: timestamp("last_post_verified_at"),
  lastPostTitle: varchar("last_post_title", { length: 500 }),
  currentSeoScore: integer("current_seo_score"),
  lastSeoScanAt: timestamp("last_seo_scan_at"),
  status: blogStatusEnum("status").default("setup"),
  notesInternal: text("notes_internal"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("blogs_domain_idx").on(table.domain),
  index("blogs_client_id_idx").on(table.clientId),
  index("blogs_status_idx").on(table.status),
]);

// ─── 4. seo_scans ───────────────────────────────────────────────────────────

export const seoScans = pgTable("seo_scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  overallScore: integer("overall_score").notNull(),
  metaScore: integer("meta_score").notNull(),
  contentScore: integer("content_score").notNull(),
  technicalScore: integer("technical_score").notNull(),
  linkScore: integer("link_score").notNull(),
  imageScore: integer("image_score").notNull(),
  pagesCrawled: integer("pages_crawled").default(0),
  issuesFound: integer("issues_found").default(0),
  criticalIssues: integer("critical_issues").default(0),
  warnings: integer("warnings").default(0),
  notices: integer("notices").default(0),
  rawData: jsonb("raw_data"),
  scanDurationMs: integer("scan_duration_ms"),
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
}, (table) => [
  index("seo_scans_blog_id_idx").on(table.blogId),
  index("seo_scans_client_id_idx").on(table.clientId),
  index("seo_scans_scanned_at_idx").on(table.scannedAt),
]);

// ─── 5. seo_issues ──────────────────────────────────────────────────────────

export const seoIssues = pgTable("seo_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scan_id").notNull().references(() => seoScans.id, { onDelete: "cascade" }),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  pageUrl: varchar("page_url", { length: 1000 }),
  category: seoCategoryEnum("category").notNull(),
  severity: issueSeverityEnum("severity").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  suggestedFix: text("suggested_fix"),
  fixPayload: jsonb("fix_payload"),
  status: issueStatusEnum("status").default("detected"),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  appliedAt: timestamp("applied_at"),
  verifiedAt: timestamp("verified_at"),
  failureReason: text("failure_reason"),
  autoFixable: boolean("auto_fixable").default(false),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("seo_issues_blog_id_idx").on(table.blogId),
  index("seo_issues_client_id_idx").on(table.clientId),
  index("seo_issues_status_idx").on(table.status),
  index("seo_issues_severity_idx").on(table.severity),
]);

// ─── 6. post_verifications ──────────────────────────────────────────────────

export const postVerifications = pgTable("post_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  checkType: checkTypeEnum("check_type").default("scheduled"),
  latestPostDate: timestamp("latest_post_date"),
  latestPostTitle: varchar("latest_post_title", { length: 500 }),
  latestPostUrl: varchar("latest_post_url", { length: 1000 }),
  postsInPeriod: integer("posts_in_period").default(0),
  expectedPosts: integer("expected_posts").default(0),
  onSchedule: boolean("on_schedule").default(true),
  daysSinceLastPost: integer("days_since_last_post"),
  alertTriggered: boolean("alert_triggered").default(false),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (table) => [
  index("post_verifications_blog_id_idx").on(table.blogId),
  index("post_verifications_client_id_idx").on(table.clientId),
]);

// ─── 7. renewal_alerts ──────────────────────────────────────────────────────

export const renewalAlerts = pgTable("renewal_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  renewalType: renewalTypeEnum("renewal_type").notNull(),
  expiryDate: date("expiry_date").notNull(),
  daysUntilExpiry: integer("days_until_expiry"),
  alertLevel: alertLevelEnum("alert_level").default("info"),
  acknowledged: boolean("acknowledged").default(false),
  renewed: boolean("renewed").default(false),
  renewedUntil: date("renewed_until"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("renewal_alerts_blog_id_idx").on(table.blogId),
  index("renewal_alerts_client_id_idx").on(table.clientId),
  index("renewal_alerts_alert_level_idx").on(table.alertLevel),
]);

// ─── 8. messages ─────────────────────────────────────────────────────────────

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
  senderRole: senderRoleEnum("sender_role").notNull(),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false),
  attachments: jsonb("attachments"),
  readByClient: boolean("read_by_client").default(false),
  readByAdmin: boolean("read_by_admin").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("messages_client_id_idx").on(table.clientId),
  index("messages_sender_id_idx").on(table.senderId),
]);

// ─── 9. reports ──────────────────────────────────────────────────────────────

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  title: varchar("title", { length: 255 }),
  summaryHtml: text("summary_html"),
  overallSeoTrend: seoTrendEnum("overall_seo_trend"),
  avgSeoScore: integer("avg_seo_score"),
  totalPostsPublished: integer("total_posts_published"),
  totalIssuesFixed: integer("total_issues_fixed"),
  blogsOnSchedule: integer("blogs_on_schedule"),
  blogsOffSchedule: integer("blogs_off_schedule"),
  highlights: jsonb("highlights"),
  concerns: jsonb("concerns"),
  rawData: jsonb("raw_data"),
  visibleToClient: boolean("visible_to_client").default(false),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (table) => [
  index("reports_client_id_idx").on(table.clientId),
]);

// ─── 10. invoices ────────────────────────────────────────────────────────────

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  type: invoiceTypeEnum("type").default("recurring"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("CAD"),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  status: invoiceStatusEnum("status").default("draft"),
  paidAt: timestamp("paid_at"),
  paidMethod: varchar("paid_method", { length: 100 }),
  reminderSentAt: timestamp("reminder_sent_at"),
  remindersCount: integer("reminders_count").default(0),
  notesInternal: text("notes_internal"),
  visibleToClient: boolean("visible_to_client").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("invoices_client_id_idx").on(table.clientId),
  index("invoices_status_idx").on(table.status),
]);

// ─── 11. seo_third_party_data ───────────────────────────────────────────────

export const seoThirdPartyData = pgTable("seo_third_party_data", {
  id: uuid("id").defaultRandom().primaryKey(),
  blogId: uuid("blog_id").notNull().references(() => blogs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  source: thirdPartySourceEnum("source").notNull(),
  domainAuthority: integer("domain_authority"),
  backlinksTotal: integer("backlinks_total"),
  referringDomains: integer("referring_domains"),
  organicKeywords: integer("organic_keywords"),
  organicTrafficEst: integer("organic_traffic_est"),
  topKeywords: jsonb("top_keywords"),
  rawResponse: jsonb("raw_response"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (table) => [
  index("seo_third_party_blog_id_idx").on(table.blogId),
  index("seo_third_party_client_id_idx").on(table.clientId),
]);

// ─── 12. activity_log ───────────────────────────────────────────────────────

export const activityLog = pgTable("activity_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("activity_log_user_id_idx").on(table.userId),
  index("activity_log_client_id_idx").on(table.clientId),
  index("activity_log_created_at_idx").on(table.createdAt),
]);

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one }) => ({
  client: one(clients, { fields: [users.clientId], references: [clients.id] }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  blogs: many(blogs),
  users: many(users),
  messages: many(messages),
  reports: many(reports),
  invoices: many(invoices),
  activityLogs: many(activityLog),
}));

export const blogsRelations = relations(blogs, ({ one, many }) => ({
  client: one(clients, { fields: [blogs.clientId], references: [clients.id] }),
  seoScans: many(seoScans),
  seoIssues: many(seoIssues),
  postVerifications: many(postVerifications),
  renewalAlerts: many(renewalAlerts),
  thirdPartyData: many(seoThirdPartyData),
}));

export const seoScansRelations = relations(seoScans, ({ one, many }) => ({
  blog: one(blogs, { fields: [seoScans.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [seoScans.clientId], references: [clients.id] }),
  issues: many(seoIssues),
}));

export const seoIssuesRelations = relations(seoIssues, ({ one }) => ({
  scan: one(seoScans, { fields: [seoIssues.scanId], references: [seoScans.id] }),
  blog: one(blogs, { fields: [seoIssues.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [seoIssues.clientId], references: [clients.id] }),
  approvedByUser: one(users, { fields: [seoIssues.approvedBy], references: [users.id] }),
}));

export const postVerificationsRelations = relations(postVerifications, ({ one }) => ({
  blog: one(blogs, { fields: [postVerifications.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [postVerifications.clientId], references: [clients.id] }),
}));

export const renewalAlertsRelations = relations(renewalAlerts, ({ one }) => ({
  blog: one(blogs, { fields: [renewalAlerts.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [renewalAlerts.clientId], references: [clients.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  client: one(clients, { fields: [messages.clientId], references: [clients.id] }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  client: one(clients, { fields: [reports.clientId], references: [clients.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
}));

export const seoThirdPartyDataRelations = relations(seoThirdPartyData, ({ one }) => ({
  blog: one(blogs, { fields: [seoThirdPartyData.blogId], references: [blogs.id] }),
  client: one(clients, { fields: [seoThirdPartyData.clientId], references: [clients.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  user: one(users, { fields: [activityLog.userId], references: [users.id] }),
  client: one(clients, { fields: [activityLog.clientId], references: [clients.id] }),
}));
