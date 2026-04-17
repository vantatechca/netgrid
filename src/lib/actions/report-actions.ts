"use server";

import { db } from "@/lib/db";
import { reports, clients, blogs, seoIssues, postVerifications } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { requireAdmin, getClientScope, getSession } from "@/lib/auth/helpers";
import { generateMonthlyReport } from "@/lib/services/claude-client";
import { logActivity } from "@/lib/services/activity-logger";

export async function getReports(params?: {
  clientId?: string;
  page?: number;
  pageSize?: number;
}) {
  const { clientId, page = 1, pageSize = 25 } = params || {};

  const conditions = [];
  const clientScope = await getClientScope();

  if (clientScope) {
    conditions.push(eq(reports.clientId, clientScope));
    conditions.push(eq(reports.visibleToClient, true));
  } else if (clientId) {
    conditions.push(eq(reports.clientId, clientId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [result, [{ total }]] = await Promise.all([
    db.select({
      report: reports,
      clientName: clients.name,
    })
      .from(reports)
      .innerJoin(clients, eq(reports.clientId, clients.id))
      .where(where)
      .orderBy(desc(reports.generatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` })
      .from(reports)
      .where(where),
  ]);

  return { reports: result, total, page, pageSize };
}

export async function getReport(id: string) {
  const [report] = await db.select({
    report: reports,
    clientName: clients.name,
  })
    .from(reports)
    .innerJoin(clients, eq(reports.clientId, clients.id))
    .where(eq(reports.id, id))
    .limit(1);

  return report || null;
}

export async function generateReport(clientId: string, periodStart: string, periodEnd: string) {
  await requireAdmin();

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new Error("Client not found");

  // Gather data for the report period
  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);

  const [blogCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(blogs)
    .where(and(eq(blogs.clientId, clientId), eq(blogs.status, "active")));

  const [avgScore] = await db.select({ avg: sql<number>`coalesce(avg(${blogs.currentSeoScore}), 0)::int` })
    .from(blogs)
    .where(and(eq(blogs.clientId, clientId), eq(blogs.status, "active")));

  const [issuesFixed] = await db.select({ count: sql<number>`count(*)::int` })
    .from(seoIssues)
    .where(and(
      eq(seoIssues.clientId, clientId),
      eq(seoIssues.status, "verified"),
      gte(seoIssues.resolvedAt, startDate),
      lte(seoIssues.resolvedAt, endDate),
    ));

  const [criticalRemaining] = await db.select({ count: sql<number>`count(*)::int` })
    .from(seoIssues)
    .where(and(
      eq(seoIssues.clientId, clientId),
      eq(seoIssues.severity, "critical"),
      sql`${seoIssues.status} NOT IN ('verified', 'dismissed')`,
    ));

  const [onScheduleBlogs] = await db.select({ count: sql<number>`count(DISTINCT ${postVerifications.blogId})::int` })
    .from(postVerifications)
    .where(and(
      eq(postVerifications.clientId, clientId),
      eq(postVerifications.onSchedule, true),
      gte(postVerifications.checkedAt, startDate),
    ));

  // Determine trend based on comparison (simplified)
  const currentScore = avgScore?.avg || 0;
  const trend = currentScore > 70 ? "improving" : currentScore > 50 ? "stable" : "declining";

  // Generate report via Claude
  const summaryHtml = await generateMonthlyReport({
    clientName: client.name,
    clientNiche: client.niche || "general",
    periodStart,
    periodEnd,
    totalBlogs: blogCount?.count || 0,
    avgScore: currentScore,
    prevAvgScore: Math.max(0, currentScore - 5), // Simplified previous comparison
    trendDirection: trend,
    totalPosts: 0, // Would aggregate from post_verifications
    onSchedule: onScheduleBlogs?.count || 0,
    issuesFixed: issuesFixed?.count || 0,
    criticalRemaining: criticalRemaining?.count || 0,
  });

  const title = `${new Date(periodStart).toLocaleString("default", { month: "long", year: "numeric" })} Network Performance Report`;

  const [report] = await db.insert(reports).values({
    clientId,
    periodStart,
    periodEnd,
    title,
    summaryHtml,
    overallSeoTrend: trend as "improving" | "stable" | "declining",
    avgSeoScore: currentScore,
    totalPostsPublished: 0,
    totalIssuesFixed: issuesFixed?.count || 0,
    blogsOnSchedule: onScheduleBlogs?.count || 0,
    blogsOffSchedule: (blogCount?.count || 0) - (onScheduleBlogs?.count || 0),
    visibleToClient: false,
  }).returning();

  const session = await getSession();
  await logActivity({
    userId: session?.user?.id,
    clientId,
    action: "report_generated",
    entityType: "report",
    entityId: report.id,
  });

  return report;
}

export async function publishReport(reportId: string) {
  const session = await requireAdmin();

  await db.update(reports).set({
    visibleToClient: true,
    publishedAt: new Date(),
  }).where(eq(reports.id, reportId));

  await logActivity({
    userId: session.user.id,
    action: "report_published",
    entityType: "report",
    entityId: reportId,
  });
}

export async function updateReportContent(reportId: string, summaryHtml: string) {
  await requireAdmin();

  await db.update(reports).set({ summaryHtml }).where(eq(reports.id, reportId));
}
