import { requireAdmin } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import {
  clients,
  blogs,
  seoIssues,
  activityLog,
  generatedPosts,
  users,
} from "@/lib/db/schema";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function DashboardPage() {
  await requireAdmin();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Aggregate stats in parallel.
  const [
    [clientCount],
    [blogCount],
    [avgSeo],
    [issueCount],
    [postsThisWeek],
    [postsTotal],
    recentActivity,
    clientList,
    allVerifications,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(sql`${clients.status} IN ('active', 'onboarding')`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(blogs)
      .where(eq(blogs.status, "active")),
    // Avg only across blogs that actually have a score; null if none scanned.
    db
      .select({
        avg: sql<number | null>`avg(${blogs.currentSeoScore})::int`,
        scanned: sql<number>`count(${blogs.currentSeoScore})::int`,
      })
      .from(blogs)
      .where(eq(blogs.status, "active")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(seoIssues)
      .where(sql`${seoIssues.status} NOT IN ('verified', 'dismissed')`),
    // Auto-published posts in the last 7 days (from the new generated_posts table).
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedPosts)
      .where(
        and(
          eq(generatedPosts.status, "published"),
          gte(generatedPosts.publishedAt, weekAgo),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedPosts)
      .where(eq(generatedPosts.status, "published")),
    // Activity log + joined names so the feed is actually readable.
    db
      .select({
        log: activityLog,
        userName: users.name,
        clientName: clients.name,
      })
      .from(activityLog)
      .leftJoin(users, eq(activityLog.userId, users.id))
      .leftJoin(clients, eq(activityLog.clientId, clients.id))
      .orderBy(desc(activityLog.createdAt))
      .limit(15),
    db
      .select({
        client: clients,
        blogCount: sql<number>`count(${blogs.id})::int`,
        avgScore: sql<number | null>`avg(${blogs.currentSeoScore})::int`,
      })
      .from(clients)
      .leftJoin(blogs, and(eq(clients.id, blogs.clientId), eq(blogs.status, "active")))
      .where(sql`${clients.status} IN ('active', 'onboarding')`)
      .groupBy(clients.id)
      .orderBy(desc(clients.createdAt))
      .limit(20),
    // Off-schedule count from the LATEST verification per blog. DISTINCT ON
    // walks the (blog_id, checked_at desc) index added in migration 0007 —
    // returns one row per blog without sorting all history in memory.
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(
        sql`(
          SELECT DISTINCT ON (blog_id) blog_id, on_schedule
          FROM post_verifications
          ORDER BY blog_id, checked_at DESC
        ) latest`,
      )
      .where(sql`latest.on_schedule = false`),
  ]);

  const offScheduleCount = Number(allVerifications[0]?.count ?? 0);

  const avgSeoValue = avgSeo.scanned > 0 && avgSeo.avg !== null ? avgSeo.avg : null;

  function seoColor(score: number | null): string {
    if (score === null) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Row — each card links to its drill-in page */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Link href="/clients">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Clients</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{clientCount.count}</p></CardContent>
          </Card>
        </Link>
        <Link href="/blogs">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Blogs</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{blogCount.count}</p></CardContent>
          </Card>
        </Link>
        <Link href="/seo">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Avg SEO Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${seoColor(avgSeoValue)}`}>
                {avgSeoValue ?? "—"}
              </p>
              {avgSeo.scanned === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No scans yet</p>
              )}
            </CardContent>
          </Card>
        </Link>
        <Link href="/seo/fix-queue">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Open Issues</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{issueCount.count}</p></CardContent>
          </Card>
        </Link>
        <Link href="/posts">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Posts (7d)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{postsThisWeek.count}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {postsTotal.count} total
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alert Panel */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-lg">Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {offScheduleCount === 0 ? (
              <p className="text-sm text-muted-foreground">No urgent alerts.</p>
            ) : (
              <Link href="/posts">
                <div className="flex items-center justify-between p-2 bg-yellow-50 rounded cursor-pointer hover:bg-yellow-100">
                  <span className="text-sm font-medium text-yellow-800">
                    {offScheduleCount} blog{offScheduleCount === 1 ? "" : "s"} off schedule
                  </span>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Client Grid */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {clientList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active or onboarding clients yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {clientList.map(({ client, blogCount: bc, avgScore }) => (
                  <Link key={client.id} href={`/clients/${client.id}`}>
                    <div className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium truncate">{client.name}</p>
                        <Badge variant={client.status === "active" ? "default" : "secondary"}>
                          {client.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{bc} blog{bc === 1 ? "" : "s"}</span>
                        <span className={seoColor(avgScore)}>
                          SEO: {avgScore ?? "—"}
                        </span>
                        {client.niche && <span>{client.niche}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed — now shows actor + client name when joined */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map(({ log, userName, clientName }) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 text-sm border-b last:border-0 pb-2 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">
                      {log.action.replace(/_/g, " ")}
                    </span>
                    {(userName || clientName) && (
                      <span className="text-muted-foreground">
                        {" — "}
                        {userName ? userName : "system"}
                        {clientName ? ` · ${clientName}` : ""}
                      </span>
                    )}
                    {log.entityType && (
                      <span className="text-muted-foreground text-xs ml-2">
                        ({log.entityType})
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}