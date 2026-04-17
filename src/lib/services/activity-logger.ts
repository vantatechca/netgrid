import { db } from "@/lib/db";
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
    // Fire-and-forget: log to console but don't throw
    console.error("Failed to log activity:", error);
  }
}
