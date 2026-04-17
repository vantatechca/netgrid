import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runInvoiceRemindersCron } from "@/lib/actions/invoice-actions";

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runInvoiceRemindersCron();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Invoice reminders cron error:", error);
    return NextResponse.json({ error: "Reminder check failed" }, { status: 500 });
  }
}
