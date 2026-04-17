import { getSession } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clients, blogs, reports, invoices, messages } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function PortalDashboard() {
  const session = await getSession();
  if (!session || session.user.role !== "client") redirect("/login");

  const clientId = session.user.clientId;
  if (!clientId) redirect("/login");

  const [
    [client],
    [blogStats],
    latestReport,
    unpaidInvoices,
    [unreadMessages],
  ] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, clientId)).limit(1),
    db.select({
      totalBlogs: sql<number>`count(*)::int`,
      avgScore: sql<number>`coalesce(avg(${blogs.currentSeoScore}), 0)::int`,
    }).from(blogs).where(and(eq(blogs.clientId, clientId), eq(blogs.status, "active"))),
    db.select().from(reports)
      .where(and(eq(reports.clientId, clientId), eq(reports.visibleToClient, true)))
      .orderBy(desc(reports.generatedAt))
      .limit(1),
    db.select().from(invoices)
      .where(and(eq(invoices.clientId, clientId), eq(invoices.visibleToClient, true), sql`${invoices.status} IN ('sent', 'overdue')`))
      .limit(5),
    db.select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.clientId, clientId), eq(messages.readByClient, false), eq(messages.isInternal, false))),
  ]);

  if (!client) redirect("/login");

  const scoreColor = blogStats.avgScore >= 80 ? "text-green-600" : blogStats.avgScore >= 60 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {client.contactName || client.name}</h1>
        <p className="text-muted-foreground">Your {client.niche} blog network overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Network SEO Score</CardTitle></CardHeader>
          <CardContent><p className={`text-3xl font-bold ${scoreColor}`}>{blogStats.avgScore}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Blogs</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{blogStats.totalBlogs}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Unread Messages</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{unreadMessages.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Invoices</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{unpaidInvoices.length}</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Latest Report */}
        <Card>
          <CardHeader><CardTitle>Latest Report</CardTitle></CardHeader>
          <CardContent>
            {latestReport.length > 0 ? (
              <div>
                <p className="font-medium">{latestReport[0].title}</p>
                <p className="text-sm text-muted-foreground mb-3">
                  {latestReport[0].periodStart} — {latestReport[0].periodEnd}
                </p>
                {latestReport[0].overallSeoTrend && (
                  <Badge variant={latestReport[0].overallSeoTrend === "improving" ? "default" : "secondary"}>
                    {latestReport[0].overallSeoTrend}
                  </Badge>
                )}
                <Link href="/portal/reports" className="block mt-3 text-sm text-primary hover:underline">
                  Read Full Report
                </Link>
              </div>
            ) : (
              <p className="text-muted-foreground">No reports available yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Invoices */}
        <Card>
          <CardHeader><CardTitle>Outstanding Invoices</CardTitle></CardHeader>
          <CardContent>
            {unpaidInvoices.length === 0 ? (
              <p className="text-muted-foreground">All invoices are paid. Thank you!</p>
            ) : (
              <div className="space-y-2">
                {unpaidInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">Due: {inv.dueDate}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${Number(inv.amount).toLocaleString()}</p>
                      <Badge variant={inv.status === "overdue" ? "destructive" : "secondary"}>{inv.status}</Badge>
                    </div>
                  </div>
                ))}
                <Link href="/portal/invoices" className="block mt-2 text-sm text-primary hover:underline">
                  View All Invoices
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
