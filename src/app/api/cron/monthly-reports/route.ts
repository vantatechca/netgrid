import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateReport } from "@/lib/actions/report-actions";
import { sendSystemMessage } from "@/lib/actions/message-actions";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeClients = await db.select()
      .from(clients)
      .where(eq(clients.status, "active"));

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of prev month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // First day of prev month

    let generated = 0;
    const errors: string[] = [];

    for (const client of activeClients) {
      try {
        await generateReport(
          client.id,
          periodStart.toISOString().split("T")[0],
          periodEnd.toISOString().split("T")[0]
        );

        await sendSystemMessage(
          client.id,
          `Your ${periodStart.toLocaleString("default", { month: "long", year: "numeric" })} performance report has been generated and is under review.`
        );

        generated++;
      } catch (error) {
        errors.push(`${client.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      totalClients: activeClients.length,
      reportsGenerated: generated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Monthly reports cron error:", error);
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }
}
