import { db } from "@/lib/db";
import { blogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getReports } from "@/lib/actions/report-actions";
import { getClientScope } from "@/lib/auth/helpers";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportHtmlContent } from "@/components/reports/report-html-content";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import {
  Calendar,
  CheckCircle2,
  FileText,
  Globe,
  Minus,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export const dynamic = "force-dynamic";

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

function trendBadgeClass(trend: string | null): string {
  if (trend === "improving")
    return "bg-green-100 text-green-800 hover:bg-green-100 border-transparent";
  if (trend === "declining")
    return "bg-red-100 text-red-800 hover:bg-red-100 border-transparent";
  return "bg-muted text-muted-foreground hover:bg-muted border-transparent";
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="size-3" />;
  if (trend === "declining") return <TrendingDown className="size-3" />;
  return <Minus className="size-3" />;
}

function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  active: "default",
  paused: "secondary",
  setup: "outline",
  decommissioned: "destructive",
};

export default async function PortalReportsPage() {
  const clientScope = await getClientScope();
  const [data, clientBlogs] = await Promise.all([
    getReports(),
    clientScope
      ? db
          .select({
            id: blogs.id,
            domain: blogs.domain,
            status: blogs.status,
            currentSeoScore: blogs.currentSeoScore,
          })
          .from(blogs)
          .where(eq(blogs.clientId, clientScope))
      : Promise.resolve(
          [] as Array<{
            id: string;
            domain: string;
            status: string | null;
            currentSeoScore: number | null;
          }>,
        ),
  ]);

  const items = data.reports;
  const latest = items[0]?.report;

  // Network averages from the live blog rows (reflect *now*, not last report).
  const scoredBlogs = clientBlogs.filter((b) => b.currentSeoScore !== null);
  const avgScore =
    scoredBlogs.length > 0
      ? Math.round(
          scoredBlogs.reduce((s, b) => s + (b.currentSeoScore ?? 0), 0) /
            scoredBlogs.length,
        )
      : null;
  const activeBlogs = clientBlogs.filter((b) => b.status === "active").length;

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30000} />

      <div>
        <h1 className="text-2xl font-bold">Performance Reports</h1>
        <p className="text-muted-foreground">
          Monthly summaries of your network&apos;s SEO health, posts, and
          growth.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Search}
          tone={
            avgScore === null
              ? "gray"
              : avgScore >= 80
              ? "green"
              : avgScore >= 60
              ? "amber"
              : "red"
          }
          label="Network SEO"
          value={avgScore ?? "—"}
          valueColor={scoreColor(avgScore)}
          sub={
            scoredBlogs.length === 0
              ? "no scans yet"
              : `${scoredBlogs.length} scanned`
          }
        />
        <StatCard
          icon={Globe}
          tone="purple"
          label="Active Blogs"
          value={activeBlogs}
          sub={`${clientBlogs.length} total`}
        />
        <StatCard
          icon={FileText}
          tone="blue"
          label="Reports"
          value={items.length}
          sub="published & visible to you"
        />
        <StatCard
          icon={latest?.overallSeoTrend === "improving" ? TrendingUp : Minus}
          tone={
            latest?.overallSeoTrend === "improving"
              ? "green"
              : latest?.overallSeoTrend === "declining"
              ? "red"
              : "gray"
          }
          label="Latest Trend"
          value={latest?.overallSeoTrend ?? "—"}
          sub={latest ? `from ${formatDate(latest.periodStart)}` : "no data yet"}
        />
      </div>

      {clientBlogs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4" />
              Blogs in your network ({clientBlogs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {clientBlogs.map((blog) => (
                <div
                  key={blog.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1 text-sm"
                >
                  <span className="font-medium">{blog.domain}</span>
                  <Badge
                    variant={
                      STATUS_VARIANT[blog.status ?? "setup"] ?? "outline"
                    }
                    className="text-[10px]"
                  >
                    {blog.status ?? "setup"}
                  </Badge>
                  {blog.currentSeoScore !== null && (
                    <span
                      className={`text-xs font-medium ${scoreColor(blog.currentSeoScore)}`}
                    >
                      SEO {blog.currentSeoScore}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
              <Calendar className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No reports yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your first report will be published at the end of the month.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {items.map((row) => {
            const report = row.report;
            const onSchedule = report.blogsOnSchedule ?? 0;
            const offSchedule = report.blogsOffSchedule ?? 0;
            const totalBlogs = onSchedule + offSchedule;
            return (
              <Card key={report.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">
                          {report.title || "Monthly Report"}
                        </CardTitle>
                        {report.overallSeoTrend && (
                          <Badge
                            className={
                              "flex items-center gap-1 text-[10px] " +
                              trendBadgeClass(report.overallSeoTrend)
                            }
                          >
                            <TrendIcon trend={report.overallSeoTrend} />
                            {report.overallSeoTrend}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(report.periodStart)} →{" "}
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

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t pt-4">
                    <Metric
                      icon={Search}
                      label="Avg SEO score"
                      value={
                        report.avgSeoScore != null
                          ? String(report.avgSeoScore)
                          : "—"
                      }
                      valueColor={scoreColor(report.avgSeoScore)}
                    />
                    <Metric
                      icon={FileText}
                      label="Posts published"
                      value={String(report.totalPostsPublished ?? 0)}
                    />
                    <Metric
                      icon={CheckCircle2}
                      label="Issues fixed"
                      value={String(report.totalIssuesFixed ?? 0)}
                    />
                    {totalBlogs > 0 && (
                      <Metric
                        icon={Globe}
                        label="On schedule"
                        value={`${onSchedule} / ${totalBlogs}`}
                        valueColor={
                          offSchedule === 0
                            ? "text-green-600"
                            : offSchedule > onSchedule
                            ? "text-red-600"
                            : "text-amber-700"
                        }
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {report.summaryHtml ? (
                    <ReportHtmlContent html={report.summaryHtml} />
                  ) : (
                    <p className="italic text-muted-foreground">
                      Report content not available.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Pieces

type Tone = "blue" | "green" | "red" | "amber" | "purple" | "gray";

const STAT_TONE: Record<Tone, { iconBg: string; iconColor: string }> = {
  blue: { iconBg: "bg-blue-100", iconColor: "text-blue-700" },
  green: { iconBg: "bg-green-100", iconColor: "text-green-700" },
  red: { iconBg: "bg-red-100", iconColor: "text-red-700" },
  amber: { iconBg: "bg-amber-100", iconColor: "text-amber-700" },
  purple: { iconBg: "bg-purple-100", iconColor: "text-purple-700" },
  gray: { iconBg: "bg-muted", iconColor: "text-muted-foreground" },
};

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: typeof Globe;
  tone: Tone;
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
}) {
  const t = STAT_TONE[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <div
            className={`flex size-7 items-center justify-center rounded-full ${t.iconBg}`}
          >
            <Icon className={`size-3.5 ${t.iconColor}`} />
          </div>
        </div>
        <p
          className={`mt-2 text-2xl font-bold tabular-nums capitalize ${valueColor ?? ""}`}
        >
          {value}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-base font-semibold tabular-nums ${valueColor ?? ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}
