import { getSeoScans, getSeoIssues } from "@/lib/actions/seo-actions";
import { requireAdmin } from "@/lib/auth/helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function SeoPage() {
  await requireAdmin();

  const { scans } = await getSeoScans();
  const { issues } = await getSeoIssues({ status: "detected" });

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SEO Monitoring</h1>
          <p className="text-muted-foreground">Track SEO health across all blogs</p>
        </div>
        <Link href="/seo/fix-queue">
          <Button>
            Fix Queue
            {criticalCount > 0 && (
              <Badge variant="destructive" className="ml-2">{criticalCount}</Badge>
            )}
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Scans</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{scans.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Issues</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{issues.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Critical</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{criticalCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Warnings</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-yellow-600">{warningCount}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Scans</CardTitle></CardHeader>
        <CardContent>
          {scans.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No scans yet. Scans run automatically via cron or can be triggered from a blog&apos;s detail page.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Blog</th>
                    <th className="text-left py-2 font-medium">Score</th>
                    <th className="text-left py-2 font-medium">Pages</th>
                    <th className="text-left py-2 font-medium">Issues</th>
                    <th className="text-left py-2 font-medium">Scanned</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.slice(0, 20).map((scan) => (
                    <tr key={scan.id} className="border-b">
                      <td className="py-2">{scan.blogId.slice(0, 8)}...</td>
                      <td className="py-2">
                        <Badge variant={scan.overallScore >= 80 ? "default" : scan.overallScore >= 60 ? "secondary" : "destructive"}>
                          {scan.overallScore}
                        </Badge>
                      </td>
                      <td className="py-2">{scan.pagesCrawled}</td>
                      <td className="py-2">{scan.issuesFound}</td>
                      <td className="py-2">{new Date(scan.scannedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
