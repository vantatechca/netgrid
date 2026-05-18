"use server";

import { db } from "@/lib/db";
import {
  reports,
  clients,
  blogs,
  seoIssues,
  seoScans,
  postVerifications,
  generatedPosts,
  users,
} from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte, lt } from "drizzle-orm";
import { requireAdmin, getClientScope, getSession } from "@/lib/auth/helpers";
import { generateMonthlyReport } from "@/lib/services/claude-client";
import { logActivity } from "@/lib/services/activity-logger";
import {
  renderReportPdf,
  reportPdfFilename,
  type ReportPdfData,
} from "@/lib/services/pdf-renderer";
import { sendReportPdfEmail } from "@/lib/services/email";
import type { EmailReportResult } from "@/lib/types/news";

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

async function generateReportInternal(
  clientId: string,
  periodStart: string,
  periodEnd: string,
  actorUserId?: string,
) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new Error("Client not found");

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);

  const [blogCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(blogs)
    .where(and(eq(blogs.clientId, clientId), eq(blogs.status, "active")));

  const [avgScore] = await db
    .select({ avg: sql<number>`coalesce(avg(${blogs.currentSeoScore}), 0)::int` })
    .from(blogs)
    .where(and(eq(blogs.clientId, clientId), eq(blogs.status, "active")));

  const [issuesFixed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(seoIssues)
    .where(
      and(
        eq(seoIssues.clientId, clientId),
        eq(seoIssues.status, "verified"),
        gte(seoIssues.resolvedAt, startDate),
        lte(seoIssues.resolvedAt, endDate),
      ),
    );

  const [criticalRemaining] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(seoIssues)
    .where(
      and(
        eq(seoIssues.clientId, clientId),
        eq(seoIssues.severity, "critical"),
        sql`${seoIssues.status} NOT IN ('verified', 'dismissed')`,
      ),
    );

  const [onScheduleBlogs] = await db
    .select({ count: sql<number>`count(DISTINCT ${postVerifications.blogId})::int` })
    .from(postVerifications)
    .where(
      and(
        eq(postVerifications.clientId, clientId),
        eq(postVerifications.onSchedule, true),
        gte(postVerifications.checkedAt, startDate),
      ),
    );

  const currentScore = avgScore?.avg || 0;

  // Real previous-period avg from seo_scans (not a fake currentScore-5).
  // Period length matches the report's window so YoY/MoM comparisons line up.
  const periodMs = endDate.getTime() - startDate.getTime();
  const prevStart = new Date(startDate.getTime() - periodMs - 24 * 60 * 60 * 1000);
  const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const [prevAvg] = await db
    .select({ avg: sql<number | null>`avg(${seoScans.overallScore})::int` })
    .from(seoScans)
    .where(
      and(
        eq(seoScans.clientId, clientId),
        gte(seoScans.scannedAt, prevStart),
        lt(seoScans.scannedAt, prevEnd),
      ),
    );
  const prevScore = prevAvg?.avg ?? currentScore; // first-ever report → no prior data
  const delta = currentScore - prevScore;
  const trend: "improving" | "stable" | "declining" =
    delta >= 3 ? "improving" : delta <= -3 ? "declining" : "stable";

  // Real posts-published count for the period (was hardcoded to 0).
  const [postsPublished] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(generatedPosts)
    .where(
      and(
        eq(generatedPosts.clientId, clientId),
        eq(generatedPosts.status, "published"),
        gte(generatedPosts.publishedAt, startDate),
        lte(generatedPosts.publishedAt, endDate),
      ),
    );
  const totalPosts = postsPublished?.count ?? 0;

  const summaryHtml = await generateMonthlyReport({
    clientName: client.name,
    clientNiche: client.niche || "general",
    periodStart,
    periodEnd,
    totalBlogs: blogCount?.count || 0,
    avgScore: currentScore,
    prevAvgScore: prevScore,
    trendDirection: trend,
    totalPosts,
    onSchedule: onScheduleBlogs?.count || 0,
    issuesFixed: issuesFixed?.count || 0,
    criticalRemaining: criticalRemaining?.count || 0,
  });

  const title = `${new Date(periodStart).toLocaleString("default", {
    month: "long",
    year: "numeric",
  })} Network Performance Report`;

  const [report] = await db
    .insert(reports)
    .values({
      clientId,
      periodStart,
      periodEnd,
      title,
      summaryHtml,
      overallSeoTrend: trend,
      avgSeoScore: currentScore,
      totalPostsPublished: totalPosts,
      totalIssuesFixed: issuesFixed?.count || 0,
      blogsOnSchedule: onScheduleBlogs?.count || 0,
      blogsOffSchedule: (blogCount?.count || 0) - (onScheduleBlogs?.count || 0),
      visibleToClient: false,
    })
    .returning();

  await logActivity({
    userId: actorUserId,
    clientId,
    action: "report_generated",
    entityType: "report",
    entityId: report.id,
  });

  return report;
}

export async function triggerMonthlyReportsManual(
  options: {
    period?: "last_month" | "last_30_days" | "month_to_date";
    /** When false, only generate the report row; skip the PDF email send. */
    sendEmail?: boolean;
  } = {},
): Promise<{
  considered: number;
  generated: number;
  failed: number;
  emailed: number;
  emailFailed: number;
  period: { start: string; end: string };
  results: Array<{
    clientId: string;
    clientName: string;
    status: "generated" | "failed";
    message: string;
    email?: { success: boolean; message: string };
  }>;
}> {
  await requireAdmin();

  const eligibleClients = await db
    .select()
    .from(clients)
    .where(sql`${clients.status} IN ('active', 'onboarding')`);

  // Period selection — admin can pick whichever window is useful right now.
  // Cron stays on last_month; manual usually wants last_30_days while testing.
  const periodKind = options.period ?? "last_30_days";
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDay = now.getUTCDate();

  let periodStart: Date;
  let periodEnd: Date;
  if (periodKind === "last_month") {
    periodEnd = new Date(Date.UTC(utcYear, utcMonth, 0));
    periodStart = new Date(Date.UTC(utcYear, utcMonth - 1, 1));
  } else if (periodKind === "month_to_date") {
    periodStart = new Date(Date.UTC(utcYear, utcMonth, 1));
    periodEnd = new Date(Date.UTC(utcYear, utcMonth, utcDay));
  } else {
    // last_30_days — rolling window ending today
    periodEnd = new Date(Date.UTC(utcYear, utcMonth, utcDay));
    periodStart = new Date(periodEnd.getTime() - 29 * 24 * 60 * 60 * 1000);
  }

  const startStr = periodStart.toISOString().split("T")[0];
  const endStr = periodEnd.toISOString().split("T")[0];
  const sendEmail = options.sendEmail ?? true;

  let generated = 0;
  let failed = 0;
  let emailed = 0;
  let emailFailed = 0;
  const results: Array<{
    clientId: string;
    clientName: string;
    status: "generated" | "failed";
    message: string;
    email?: { success: boolean; message: string };
  }> = [];

  for (const client of eligibleClients) {
    try {
      await generateReportForCron(client.id, startStr, endStr);
      generated++;

      // Email send happens after generation — non-fatal so one bad
      // recipient or Resend hiccup doesn't roll back the whole batch.
      let emailResult: { success: boolean; message: string } | undefined;
      if (sendEmail) {
        const latest = await getLatestReportForClientPeriod(
          client.id,
          startStr,
        );
        if (latest) {
          emailResult = await emailReportPdfInternal(latest.id);
          if (emailResult.success) emailed++;
          else emailFailed++;
        } else {
          emailResult = {
            success: false,
            message: "Could not locate just-generated report row",
          };
          emailFailed++;
        }
      }

      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "generated",
        message: `Report for ${startStr} → ${endStr} generated`,
        email: emailResult,
      });
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "failed",
        message,
      });
    }
  }

  return {
    considered: eligibleClients.length,
    generated,
    failed,
    emailed,
    emailFailed,
    period: { start: startStr, end: endStr },
    results,
  };
}

/**
 * Look up the most-recently-generated report row for a client/period.
 * Used by the manual trigger + the cron to grab the row id after
 * generateReportForCron returns void.
 */
async function getLatestReportForClientPeriod(
  clientId: string,
  periodStart: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.clientId, clientId), eq(reports.periodStart, periodStart)))
    .orderBy(desc(reports.generatedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Admin-callable: generate a monthly report for one client. Requires an admin
 * session — redirects to /login otherwise. For cron / system-triggered runs
 * use `generateReportForCron()` below.
 *
 * Also emails the PDF to the client after generation. Set
 * options.sendEmail = false to skip — useful when previewing the report
 * before delivery.
 */
export async function generateReport(
  clientId: string,
  periodStart: string,
  periodEnd: string,
  options: { sendEmail?: boolean } = {},
) {
  const session = await requireAdmin();
  const report = await generateReportInternal(
    clientId,
    periodStart,
    periodEnd,
    session.user.id,
  );

  const sendEmail = options.sendEmail ?? true;
  let email: EmailReportResult | undefined;
  if (sendEmail && report?.id) {
    // Non-fatal: a delivery failure shouldn't roll back the report row.
    email = await emailReportPdfInternal(report.id);
  }

  return { ...report, email };
}

export async function unpublishReport(reportId: string) {
  await requireAdmin();
  await db.update(reports).set({
    visibleToClient: false,
    publishedAt: null,
  }).where(eq(reports.id, reportId));
}
/**
 * Cron-callable variant: skips the NextAuth session check. Only call this
 * from a route that has already verified `CRON_SECRET` itself.
 */
export async function generateReportForCron(
  clientId: string,
  periodStart: string,
  periodEnd: string,
) {
  return generateReportInternal(clientId, periodStart, periodEnd);
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

// ─── PDF + Email delivery ───────────────────────────────────────────────────

/**
 * Resolve the best email address to send a report to for a given client.
 *
 *   1. clients.contact_email  (primary contact set during onboarding)
 *   2. first client-role user with non-null email
 *
 * Returns null when neither is available — the caller decides whether
 * to skip silently or log.
 */
async function resolveRecipientEmail(clientId: string): Promise<{
  email: string;
  clientName: string;
} | null> {
  const [client] = await db
    .select({
      name: clients.name,
      contactEmail: clients.contactEmail,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return null;

  if (client.contactEmail && client.contactEmail.trim().length > 0) {
    return { email: client.contactEmail.trim(), clientName: client.name };
  }

  // Fall back to the first client-role user linked to this client.
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.clientId, clientId), eq(users.role, "client")))
    .limit(1);
  if (user?.email) {
    return { email: user.email, clientName: client.name };
  }

  return null;
}

function periodLabel(periodStart: string): string {
  try {
    const d = new Date(periodStart);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
  } catch {
    return periodStart;
  }
}

// EmailReportResult lives in src/lib/types/news.ts so this "use server"
// file only exports async functions (Next 14 rejects non-async exports
// in server action files).

/**
 * Build a PDF from the persisted report row and email it to the client.
 *
 * Cron-bypass internal version. Safe to call from a route that has
 * already verified CRON_SECRET — does NOT call requireAdmin.
 */
export async function emailReportPdfInternal(
  reportId: string,
): Promise<EmailReportResult> {
  const [row] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  if (!row) {
    return { success: false, message: "Report not found" };
  }

  const recipient = await resolveRecipientEmail(row.clientId);
  if (!recipient) {
    return {
      success: false,
      message:
        "No recipient email — set clients.contact_email or attach a client-role user",
    };
  }

  const pdfData: ReportPdfData = {
    clientName: recipient.clientName,
    periodStart: String(row.periodStart),
    periodEnd: String(row.periodEnd),
    title: row.title,
    summaryHtml: row.summaryHtml,
    overallSeoTrend: row.overallSeoTrend,
    avgSeoScore: row.avgSeoScore,
    totalPostsPublished: row.totalPostsPublished,
    totalIssuesFixed: row.totalIssuesFixed,
    blogsOnSchedule: row.blogsOnSchedule,
    blogsOffSchedule: row.blogsOffSchedule,
    highlights: row.highlights,
    concerns: row.concerns,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderReportPdf(pdfData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF render failed";
    return { success: false, message };
  }

  try {
    const result = await sendReportPdfEmail({
      to: recipient.email,
      clientName: recipient.clientName,
      periodLabel: periodLabel(pdfData.periodStart),
      pdfFilename: reportPdfFilename(pdfData),
      pdfBuffer,
    });
    return {
      success: true,
      message: `Sent to ${recipient.email}`,
      emailId: result?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    return { success: false, message };
  }
}

/**
 * Admin-callable variant. Used by a "Resend Report" button in the
 * reports admin page.
 */
export async function emailReportPdf(
  reportId: string,
): Promise<EmailReportResult> {
  const session = await requireAdmin();
  const result = await emailReportPdfInternal(reportId);
  if (result.success) {
    await logActivity({
      userId: session.user.id,
      action: "report_pdf_emailed",
      entityType: "report",
      entityId: reportId,
      details: { emailId: result.emailId },
    });
  }
  return result;
}
