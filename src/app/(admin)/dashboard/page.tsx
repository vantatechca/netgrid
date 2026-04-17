import { requireAdmin } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { clients, blogs, seoIssues, invoices, renewalAlerts, activityLog, postVerifications } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function DashboardPage() {
  await requireAdmin();

  // Aggregate stats in parallel
  const [
    [clientCount],
    [blogCount],
    [avgSeo],
    [issueCount],
    [overdueInvoices],
    urgentAlerts,
    recentActivity,
    clientList,
    offScheduleBlogs,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(clients).where(eq(clients.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(blogs).where(eq(blogs.status, "active")),
    db.select({ avg: sql<number>`coalesce(avg(${blogs.currentSeoScore}), 0)::int` }).from(blogs).where(eq(blogs.status, "active")),
    db.select({ count: sql<number>`count(*)::int` }).from(seoIssues).where(sql`${seoIssues.status} NOT IN ('verified', 'dismissed')`),
    db.select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${invoices.amount}::numeric), 0)::numeric` }).from(invoices).where(eq(invoices.status, "overdue")),
    db.select({ alert: renewalAlerts, blogDomain: blogs.domain, clientName: clients.name })
      .from(renewalAlerts)
      .innerJoin(blogs, eq(renewalAlerts.blogId, blogs.id))
      .innerJoin(clients, eq(renewalAlerts.clientId, clients.id))
      .where(and(eq(renewalAlerts.renewed, false), sql`${renewalAlerts.alertLevel} IN ('urgent', 'overdue')`))
      .limit(10),
    db.select({ log: activityLog })
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(15),
    db.select({
      client: clients,
      blogCount: sql<number>`count(${blogs.id})::int`,
      avgScore: sql<number>`coalesce(avg(${blogs.currentSeoScore}), 0)::int`,
    })
      .from(clients)
      .leftJoin(blogs, and(eq(clients.id, blogs.clientId), eq(blogs.status, "active")))
      .where(eq(clients.status, "active"))
      .groupBy(clients.id)
      .orderBy(desc(clients.createdAt))
      .limit(20),
    db.select({ count: sql<number>`count(DISTINCT ${postVerifications.blogId})::int` })
      .from(postVerifications)
      .where(eq(postVerifications.onSchedule, false)),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Clients</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{clientCount.count}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Blogs</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{blogCount.count}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg SEO Score</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${avgSeo.avg >= 80 ? "text-green-600" : avgSeo.avg >= 60 ? "text-yellow-600" : "text-red-600"}`}>
              {avgSeo.avg}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Issues</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{issueCount.count}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overdue Revenue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">${Number(overdueInvoices.total).toLocaleString()}</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alert Panel */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-lg">Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {urgentAlerts.length === 0 && offScheduleBlogs[0]?.count === 0 && overdueInvoices.count === 0 ? (
              <p className="text-sm text-muted-foreground">No urgent alerts.</p>
            ) : (
              <>
                {overdueInvoices.count > 0 && (
                  <Link href="/invoices">
                    <div className="flex items-center justify-between p-2 bg-red-50 rounded cursor-pointer hover:bg-red-100">
                      <span className="text-sm font-medium text-red-800">{overdueInvoices.count} overdue invoice(s)</span>
                      <Badge variant="destructive">${Number(overdueInvoices.total).toLocaleString()}</Badge>
                    </div>
                  </Link>
                )}
                {offScheduleBlogs[0]?.count > 0 && (
                  <Link href="/posts">
                    <div className="flex items-center justify-between p-2 bg-yellow-50 rounded cursor-pointer hover:bg-yellow-100">
                      <span className="text-sm font-medium text-yellow-800">{offScheduleBlogs[0].count} blog(s) off schedule</span>
                    </div>
                  </Link>
                )}
                {urgentAlerts.map(({ alert, blogDomain }) => (
                  <Link key={alert.id} href="/renewals">
                    <div className="flex items-center justify-between p-2 bg-orange-50 rounded cursor-pointer hover:bg-orange-100">
                      <span className="text-sm text-orange-800 truncate">{blogDomain} — {alert.renewalType} expires</span>
                      <Badge className="bg-orange-100 text-orange-800">{alert.daysUntilExpiry}d</Badge>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Client Grid */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {clientList.map(({ client, blogCount: bc, avgScore }) => (
                <Link key={client.id} href={`/clients/${client.id}`}>
                  <div className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium truncate">{client.name}</p>
                      <Badge variant={client.billingStatus === "active" ? "default" : "destructive"}>
                        {client.billingStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{bc} blogs</span>
                      <span className={avgScore >= 80 ? "text-green-600" : avgScore >= 60 ? "text-yellow-600" : "text-red-600"}>
                        SEO: {avgScore}
                      </span>
                      <span>{client.niche}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map(({ log }) => (
                <div key={log.id} className="flex items-center justify-between text-sm">
                  <span>{log.action.replace(/_/g, " ")}{log.entityType ? ` (${log.entityType})` : ""}</span>
                  <span className="text-muted-foreground text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
