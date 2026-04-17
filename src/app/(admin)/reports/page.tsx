import { getReports } from "@/lib/actions/report-actions";
import { requireAdmin } from "@/lib/auth/helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function ReportsPage() {
  await requireAdmin();
  const { reports } = await getReports();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Auto-generated monthly performance reports</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>All Reports</CardTitle></CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No reports yet. Reports are auto-generated on the 1st of each month.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Title</th>
                    <th className="text-left py-2 font-medium">Client</th>
                    <th className="text-left py-2 font-medium">Period</th>
                    <th className="text-left py-2 font-medium">SEO Score</th>
                    <th className="text-left py-2 font-medium">Trend</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(({ report, clientName }) => (
                    <tr key={report.id} className="border-b">
                      <td className="py-2 font-medium">{report.title}</td>
                      <td className="py-2">{clientName}</td>
                      <td className="py-2">{report.periodStart} — {report.periodEnd}</td>
                      <td className="py-2">{report.avgSeoScore ?? "—"}</td>
                      <td className="py-2">
                        {report.overallSeoTrend && (
                          <Badge variant={report.overallSeoTrend === "improving" ? "default" : report.overallSeoTrend === "stable" ? "secondary" : "destructive"}>
                            {report.overallSeoTrend}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <Badge variant={report.visibleToClient ? "default" : "outline"}>
                          {report.visibleToClient ? "Published" : "Draft"}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <Link href={`/reports/${report.id}`}>
                          <Button size="sm" variant="outline">View</Button>
                        </Link>
                      </td>
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
