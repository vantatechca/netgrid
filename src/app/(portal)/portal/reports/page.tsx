import { getReports } from "@/lib/actions/report-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportHtmlContent } from "@/components/reports/report-html-content";

export default async function PortalReportsPage() {
  const { reports } = await getReports();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Performance Reports</h1>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No reports available yet. Your first report will be generated next month.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map(({ report }) => (
            <Card key={report.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{report.title}</CardTitle>
                  {report.overallSeoTrend && (
                    <Badge variant={report.overallSeoTrend === "improving" ? "default" : "secondary"}>
                      {report.overallSeoTrend}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {report.periodStart} — {report.periodEnd}
                </p>
              </CardHeader>
              <CardContent>
                {report.summaryHtml ? (
                  <ReportHtmlContent html={report.summaryHtml} />
                ) : (
                  <p className="text-muted-foreground">Report content not available.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
