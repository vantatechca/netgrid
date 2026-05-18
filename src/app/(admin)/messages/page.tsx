import { requireAdmin } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { clients, messages } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import Link from "next/link";

function timeAgo(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export default async function MessagesPage() {
  await requireAdmin();

  // 1. Threads with unread count + total — same as before, just clean syntax,
  //    and includes onboarding clients (not just 'active') so new conversations
  //    show up immediately.
  const threads = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      clientNiche: clients.niche,
      unreadCount: sql<number>`count(CASE WHEN ${messages.readByAdmin} = false AND ${messages.senderRole} = 'client' THEN 1 END)::int`,
      totalMessages: sql<number>`count(${messages.id})::int`,
      latestAt: sql<string | null>`max(${messages.createdAt})`,
    })
    .from(clients)
    .leftJoin(messages, eq(clients.id, messages.clientId))
    .where(sql`${clients.status} IN ('active', 'onboarding')`)
    .groupBy(clients.id, clients.name, clients.niche)
    .orderBy(desc(sql`max(${messages.createdAt})`));

  // 2. Latest ADMIN message and latest CLIENT message per client — used for
  //    the inline preview ("Admin: ..." on top, "Client: ..." below).
  //    DISTINCT ON in Postgres returns the first row per partition so we sort
  //    by createdAt DESC within each client/role pair.
  const latestPerRole = await db.execute<{
    client_id: string;
    sender_role: "admin" | "client" | "system";
    content: string;
    created_at: Date;
  }>(sql`
    SELECT DISTINCT ON (client_id, sender_role)
      client_id, sender_role, content, created_at
    FROM messages
    WHERE sender_role IN ('admin', 'client')
    ORDER BY client_id, sender_role, created_at DESC
  `);

  // Drizzle's neon-http returns { rows: [...] } here, not the array directly.
  const previewRows = Array.isArray(latestPerRole)
    ? latestPerRole
    : ((latestPerRole as unknown as { rows?: typeof latestPerRole.rows }).rows ?? []);

  // Pivot: { [clientId]: { admin: {...}, client: {...} } }
  const previewMap = new Map<
    string,
    {
      admin?: { content: string; createdAt: Date };
      client?: { content: string; createdAt: Date };
    }
  >();
  for (const row of previewRows ?? []) {
    const entry = previewMap.get(row.client_id) ?? {};
    if (row.sender_role === "admin") {
      entry.admin = { content: row.content, createdAt: new Date(row.created_at) };
    } else if (row.sender_role === "client") {
      entry.client = { content: row.content, createdAt: new Date(row.created_at) };
    }
    previewMap.set(row.client_id, entry);
  }

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={15000} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-muted-foreground">
            Client communication threads · auto-refreshes every 15s
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Live
        </Badge>
      </div>

      <div className="space-y-3">
        {threads.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No active client threads.
            </CardContent>
          </Card>
        ) : (
          threads.map((thread) => {
            const preview = previewMap.get(thread.clientId) ?? {};
            return (
              <Link
                key={thread.clientId}
                href={`/clients/${thread.clientId}/messages`}
              >
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="py-4 space-y-3">
                    {/* Top row: client name + meta */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{thread.clientName}</p>
                        {thread.clientNiche && (
                          <p className="text-xs text-muted-foreground truncate">
                            {thread.clientNiche}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {thread.unreadCount > 0 && (
                          <Badge variant="destructive">
                            {thread.unreadCount} unread
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {thread.totalMessages} msg{thread.totalMessages === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    {/* Preview: admin reply on top, client message below */}
                    {(preview.admin || preview.client) && (
                      <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5">
                        {preview.admin ? (
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                              Admin
                            </Badge>
                            <p className="flex-1 text-xs text-muted-foreground">
                              {truncate(preview.admin.content, 140)}
                            </p>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {timeAgo(preview.admin.createdAt)}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">
                            No admin replies yet.
                          </p>
                        )}
                        {preview.client ? (
                          <div className="flex items-start gap-2">
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] uppercase"
                            >
                              Client
                            </Badge>
                            <p className="flex-1 text-xs text-muted-foreground">
                              {truncate(preview.client.content, 140)}
                            </p>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {timeAgo(preview.client.createdAt)}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">
                            No messages from this client yet.
                          </p>
                        )}
                      </div>
                    )}

                    {!preview.admin && !preview.client && thread.totalMessages === 0 && (
                      <p className="text-xs italic text-muted-foreground">
                        No messages exchanged yet.
                      </p>
                    )}

                    {thread.latestAt && (
                      <p className="text-[10px] text-muted-foreground">
                        Last activity {timeAgo(new Date(thread.latestAt))}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}