import { db } from "@/lib/db";
import { recordPipelineError } from "@/lib/services/run-telemetry";
import { activityLog } from "@/lib/db/schema";
import type { ActivityDetails } from "@/lib/types";

export async function logActivity(params: {
  userId?: string | null;
  clientId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: ActivityDetails;
}) {
  try {
    await db.insert(activityLog).values({
      userId: params.userId || null,
      clientId: params.clientId || null,
      action: params.action,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      details: params.details || null,
    });
  } catch (error) {
    // Fire-and-forget: record but never throw. Different table from
    // pipeline_errors, so there is no recursion risk here.
    recordPipelineError({
      site: "activity-logger.log",
      code: "ACTIVITY_LOG_FAILED",
      severity: "error",
      message: `Failed to log activity: ${
        error instanceof Error ? error.message : String(error)
      }`,
      context: { action: params.action, entityType: params.entityType ?? null },
    });
  }
}
