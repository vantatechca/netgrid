import { getSession } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clients, blogs, reports, messages } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import Link from "next/link";

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scoreColorClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export default async function PortalDashboard() {
  const session = await getSession();
  if (!session || session.user.role !== "client") redirect("/login");

  const clientId = session.user.clientId;
  if (!clientId) redirect("/login");

  const [[client], [blogStats], latestReport, [unreadMessages]] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, clientId)).limit(1),

    // Avg only across blogs that actually have a score; null if none scanned —
    // so the card shows "—" instead of a misleading 0.
    db
      .select({
        totalBlogs: sql<number>`count(*)::int`,
        scoredBlogs: sql<number>`count(${blogs.currentSeoScore})::int`,
        avgScore: sql<number | null>`avg(${blogs.currentSeoScore})::int`,
      })
      .from(blogs)
      .where(and(eq(blogs.clientId, clientId), eq(blogs.status, "active"))),

    db
      .select()
      .from(reports)
      .where(and(eq(reports.clientId, clientId), eq(reports.visibleToClient, true)))
      .orderBy(desc(reports.generatedAt))
      .limit(1),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.clientId, clientId),
          eq(messages.readByClient, false),
          eq(messages.isInternal, false),
        ),
      ),
  ]);

  if (!client) redirect("/login");

  const avgScore =
    blogStats.scoredBlogs > 0 && blogStats.avgScore !== null ? blogStats.avgScore : null;
  const unreadCount = unreadMessages?.count ?? 0;

  return (
    <div className="space-y-6">
      {/* Auto-refresh every 20s so new admin replies / reports show up
          without a manual reload */}
      <AutoRefresh intervalMs={20000} />

      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {client.contactName || client.name}
        </h1>
        <p className="text-muted-foreground">
          {client.niche
            ? `Your ${client.niche} blog network overview`
            : "Your blog network overview"}
        </p>
      </div>

      {/* Stat cards — clickable links to their drill-in pages */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/portal/seo">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Network SEO Score</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${scoreColorClass(avgScore)}`}>
                {avgScore ?? "—"}
              </p>
              {avgScore === null && (
                <p className="text-xs text-muted-foreground mt-1">No scans yet</p>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/blogs">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Blogs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{blogStats.totalBlogs}</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/portal/messages">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Unread Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-3xl font-bold ${unreadCount > 0 ? "text-blue-600" : ""}`}>
                {unreadCount}
              </p>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Click to read</p>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Latest Report */}
      <Card>
        <CardHeader>
          <CardTitle>Latest Report</CardTitle>
        </CardHeader>
        <CardContent>
          {latestReport.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium">{latestReport[0].title || "Monthly Report"}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(latestReport[0].periodStart)} —{" "}
                {formatDate(latestReport[0].periodEnd)}
              </p>
              {latestReport[0].overallSeoTrend && (
                <Badge
                  variant={
                    latestReport[0].overallSeoTrend === "improving"
                      ? "default"
                      : latestReport[0].overallSeoTrend === "declining"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {latestReport[0].overallSeoTrend}
                </Badge>
              )}
              <Link
                href="/portal/reports"
                className="block pt-2 text-sm text-primary hover:underline"
              >
                Read Full Report →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground">No reports available yet.</p>
              <Link
                href="/portal/reports"
                className="block text-sm text-primary hover:underline"
              >
                View Reports →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
