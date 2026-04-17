import { getSession } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalSeoPage() {
  const session = await getSession();
  if (!session || !session.user.clientId) redirect("/login");

  const [stats] = await db.select({
    avgScore: sql<number>`coalesce(avg(${blogs.currentSeoScore}), 0)::int`,
    totalBlogs: sql<number>`count(*)::int`,
    goodBlogs: sql<number>`count(CASE WHEN ${blogs.currentSeoScore} >= 80 THEN 1 END)::int`,
    fairBlogs: sql<number>`count(CASE WHEN ${blogs.currentSeoScore} >= 60 AND ${blogs.currentSeoScore} < 80 THEN 1 END)::int`,
    poorBlogs: sql<number>`count(CASE WHEN ${blogs.currentSeoScore} < 60 THEN 1 END)::int`,
  })
    .from(blogs)
    .where(and(eq(blogs.clientId, session.user.clientId), eq(blogs.status, "active")));

  const scoreColor = stats.avgScore >= 80 ? "text-green-600" : stats.avgScore >= 60 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">SEO Health</h1>

      <Card>
        <CardContent className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-2">Network SEO Score</p>
          <p className={`text-6xl font-bold ${scoreColor}`}>{stats.avgScore}</p>
          <p className="text-sm text-muted-foreground mt-2">out of 100</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Good (80+)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{stats.goodBlogs} blogs</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Fair (60-79)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-yellow-600">{stats.fairBlogs} blogs</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Needs Work (&lt;60)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{stats.poorBlogs} blogs</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          <p>Our team continuously monitors and optimizes your blog network&apos;s SEO performance.</p>
          <p>Check your monthly reports for detailed analysis and improvements.</p>
        </CardContent>
      </Card>
    </div>
  );
}
