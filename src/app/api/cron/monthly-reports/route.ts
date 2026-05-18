import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import {
  generateReportForCron,
  emailReportPdfInternal,
} from "@/lib/actions/report-actions";
import { db } from "@/lib/db";
import { clients, reports } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { sendSystemMessage } from "@/lib/actions/message-actions";

// Claude calls take 5-15s × N clients × serial. At 10+ clients the
// previous 120s ceiling could time out mid-loop and leave half the
// network with unreported months. Match auto-publish at 300s.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Include onboarding clients too — new accounts deserve their first report
    const activeClients = await db
      .select()
      .from(clients)
      .where(sql`${clients.status} IN ('active', 'onboarding')`);

    const now = new Date();
const utcYear = now.getUTCFullYear();
const utcMonth = now.getUTCMonth(); // 0-indexed: April = 3

// Last day of the PREVIOUS month, in UTC.
// Date.UTC(year, month, 0) gives day 0 of `month`, which is the last day of month-1.
const periodEnd = new Date(Date.UTC(utcYear, utcMonth, 0));

// First day of the same previous month, in UTC.
const periodStart = new Date(Date.UTC(utcYear, utcMonth - 1, 1));

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

    for (const client of activeClients) {
      try {
        // Use the cron-only variant — generateReport() requires an admin
        // session (calls requireAdmin → redirects to /login from cron).
        await generateReportForCron(
          client.id,
          periodStart.toISOString().split("T")[0],
          periodEnd.toISOString().split("T")[0],
        );

        await sendSystemMessage(
          client.id,
          `Your ${periodStart.toLocaleString("default", {
            month: "long",
            year: "numeric",
          })} performance report has been generated and is under review.`,
        );

        // Pick up the row we just created so we can email the PDF.
        // generateReportForCron doesn't return the inserted id, so we
        // look it up by (clientId, periodStart) which is uniquely keyed
        // for the just-generated row.
        const periodStartIso = periodStart.toISOString().split("T")[0];
        const [latest] = await db
          .select({ id: reports.id, generatedAt: reports.generatedAt })
          .from(reports)
          .where(
            and(
              eq(reports.clientId, client.id),
              eq(reports.periodStart, periodStartIso),
            ),
          )
          .orderBy(desc(reports.generatedAt))
          .limit(1);

        let emailResult: { success: boolean; message: string } | undefined;
        if (latest) {
          // Email send is non-fatal: a missing recipient or transient
          // Resend error should not roll back the report generation
          // for the rest of the network.
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

        generated++;
        results.push({
          clientId: client.id,
          clientName: client.name,
          status: "generated",
          message: `Report for ${periodStart.toLocaleDateString()} generated`,
          email: emailResult,
        });
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Monthly report failed for ${client.name}:`, error);
        results.push({
          clientId: client.id,
          clientName: client.name,
          status: "failed",
          message,
        });
      }
    }

    return NextResponse.json({
      considered: activeClients.length,
      generated,
      failed,
      emailed,
      emailFailed,
      period: {
        start: periodStart.toISOString().split("T")[0],
        end: periodEnd.toISOString().split("T")[0],
      },
      results,
    });
  } catch (error) {
    console.error("Monthly reports cron error:", error);
    const message = error instanceof Error ? error.message : "Report generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}