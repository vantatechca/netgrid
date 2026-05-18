import { requireAdmin } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { activityLog, users, clients } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";

export default async function ActivityPage() {
  await requireAdmin();

  const activities = await db.select({
    log: activityLog,
    userName: users.name,
    clientName: clients.name,
  })
    .from(activityLog)
    .leftJoin(users, eq(activityLog.userId, users.id))
    .leftJoin(clients, eq(activityLog.clientId, clients.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground">System-wide audit trail of all actions</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No activity recorded yet.</p>
          ) : (
            <div className="divide-y">
              {activities.map(({ log, userName, clientName }) => (
                <div key={log.id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{userName || "System"}</span>
                      {" "}
                      <span className="text-muted-foreground">{formatAction(log.action)}</span>
                      {clientName && (
                        <span className="text-muted-foreground"> for {clientName}</span>
                      )}
                    </p>
                    {log.entityType && (
                      <p className="text-xs text-muted-foreground">
                        {log.entityType} {log.entityId ? `(${log.entityId.slice(0, 8)}...)` : ""}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}
