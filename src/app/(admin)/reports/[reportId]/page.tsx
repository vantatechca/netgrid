import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";
import { getReport } from "@/lib/actions/report-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReportHtmlContent } from "@/components/reports/report-html-content";
import { PublishToggle } from "@/components/reports/publish-toggle";
import { fmtUsd } from "@/components/reports/report-pieces";
import { ArrowLeft, Globe, Minus, TrendingDown, TrendingUp } from "lucide-react";

interface ReportDetailPageProps {
  params: { reportId: string };
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  setup: "outline",
  decommissioned: "destructive",
};

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
  await requireAdmin();

  const result = await getReport(params.reportId);
  if (!result) notFound();
  const { report, clientName } = result;

  // Blogs that belong to this report's client — what the report covers
  const reportBlogs = await db
    .select({
      id: blogs.id,
      domain: blogs.domain,
      status: blogs.status,
      currentSeoScore: blogs.currentSeoScore,
    })
    .from(blogs)
    .where(eq(blogs.clientId, report.clientId));

  const trend = report.overallSeoTrend;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{report.title}</h1>
            <p className="text-sm text-muted-foreground">
              {clientName} &middot; {formatDate(report.periodStart)} —{" "}
              {formatDate(report.periodEnd)}
              {report.generatedAt && (
                <>
                  <span className="mx-1.5">·</span>
                  <span className="text-xs">
                    generated {formatDate(report.generatedAt)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={report.visibleToClient ? "default" : "outline"}>
            {report.visibleToClient ? "Published" : "Draft"}
          </Badge>
          <PublishToggle
            reportId={report.id}
            isPublished={!!report.visibleToClient}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg SEO Score</CardDescription>
            <CardTitle className="text-2xl">{report.avgSeoScore ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Posts Published</CardDescription>
            <CardTitle className="text-2xl">{report.totalPostsPublished ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Issues Fixed</CardDescription>
            <CardTitle className="text-2xl">{report.totalIssuesFixed ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Trend</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl capitalize">
              {trend === "improving" && <TrendingUp className="size-5 text-green-600" />}
              {trend === "declining" && <TrendingDown className="size-5 text-red-600" />}
              {trend === "stable" && <Minus className="size-5 text-muted-foreground" />}
              {trend ?? "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Generation Cost</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {report.totalCostUsd != null
                ? fmtUsd(Number(report.totalCostUsd))
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Schedule + extra stats — show only if populated */}
      {report.blogsOnSchedule != null && report.blogsOffSchedule != null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Posting schedule compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <span className="font-semibold">{report.blogsOnSchedule}</span>
              <span className="text-muted-foreground"> on schedule, </span>
              <span className="font-semibold">{report.blogsOffSchedule}</span>
              <span className="text-muted-foreground"> behind</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Blogs covered by this report */}
      {reportBlogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" />
              Blogs covered ({reportBlogs.length})
            </CardTitle>
            <CardDescription>
              The {clientName} network at the time of this report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {reportBlogs.map((b) => (
                <Link key={b.id} href={`/blogs/${b.id}`}>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1 text-sm hover:bg-muted">
                    <span className="font-medium">{b.domain}</span>
                    <Badge
                      variant={STATUS_VARIANT[b.status ?? "setup"] ?? "outline"}
                      className="text-[10px]"
                    >
                      {b.status}
                    </Badge>
                    {b.currentSeoScore !== null && (
                      <span className="text-xs text-muted-foreground">
                        SEO {b.currentSeoScore}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary HTML */}
      <Card>
        <CardHeader>
          <CardTitle>Report Summary</CardTitle>
          {!report.visibleToClient && (
            <CardDescription className="text-amber-700">
              Draft — only admins can see this. Click <strong>Publish to client</strong> above
              to make it visible on their portal.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {report.summaryHtml ? (
            <ReportHtmlContent html={report.summaryHtml} />
          ) : (
            <p className="text-muted-foreground">No summary content available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}