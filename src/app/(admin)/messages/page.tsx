import { requireAdmin } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { clients, messages } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function MessagesPage() {
  await requireAdmin();

  // Get all clients with their latest message and unread count
  const clientThreads = await db.select({
    clientId: clients.id,
    clientName: clients.name,
    clientNiche: clients.niche,
    unreadCount: sql<number>`count(CASE WHEN ${messages.readByAdmin} = false THEN 1 END)::int`,
    totalMessages: sql<number>`count(${messages.id})::int`,
    latestMessage: sql<string>`max(${messages.createdAt})`,
  })
    .from(clients)
    .leftJoin(messages, eq(clients.id, messages.clientId))
    .where(eq(clients.status, "active"))
    .groupBy(clients.id, clients.name, clients.niche)
    .orderBy(desc(sql`max(${messages.createdAt})`));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-muted-foreground">Client communication threads</p>
      </div>

      <div className="space-y-3">
        {clientThreads.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-muted-foreground">
              No active client threads.
            </CardContent>
          </Card>
        ) : (
          clientThreads.map((thread) => (
            <Link key={thread.clientId} href={`/clients/${thread.clientId}/messages`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{thread.clientName}</p>
                      <p className="text-sm text-muted-foreground">{thread.clientNiche}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {thread.unreadCount > 0 && (
                        <Badge variant="destructive">{thread.unreadCount} unread</Badge>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {thread.totalMessages} messages
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
