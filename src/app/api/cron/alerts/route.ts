import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { runWithTelemetry } from "@/lib/services/run-telemetry";
import { evaluateAndSendAlerts } from "@/lib/services/pipeline-alerts";

// A dozen aggregate queries plus up to a handful of Resend calls.
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Wrapped so the alerter itself is covered by the liveness rule it
    // implements: no cron_runs row for job='alerts' is itself detectable.
    const result = await runWithTelemetry({ job: "alerts" }, () =>
      evaluateAndSendAlerts(),
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("[alerts] cron error:", error);
    const message = error instanceof Error ? error.message : "Alert run failed";
    return NextResponse.json({ error: message, job: "alerts" }, { status: 500 });
  }
}
