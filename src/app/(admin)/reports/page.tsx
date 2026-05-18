import Link from "next/link";
import { requireAdmin } from "@/lib/auth/helpers";
import { getReports } from "@/lib/actions/report-actions";
import { Badge } from "@/components/ui/badge";
import { TriggerReportsButton } from "@/components/reports/trigger-reports-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Minus,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

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

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: { filter?: string };
}) {
  await requireAdmin();
  const data = await getReports({ pageSize: 100 });
  const items = data.reports;

  const activeFilter: Filter =
    (FILTERS.find((f) => f.value === searchParams?.filter)?.value as Filter) ?? "";

  const visible = items.filter((row) => {
    if (activeFilter === "published") return row.report.visibleToClient;
    if (activeFilter === "draft") return !row.report.visibleToClient;
    return true;
  });

  // Top-line stats across the FULL list
  const publishedCount = items.filter((r) => r.report.visibleToClient).length;
  const draftCount = items.length - publishedCount;
  const uniqueClients = new Set(items.map((r) => r.clientName)).size;
  const totalPostsPublished = items.reduce(
    (s, r) => s + (r.report.totalPostsPublished ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">
            Client performance reports — generated monthly, optionally published
            to the portal.
          </p>
        </div>
        <TriggerReportsButton />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          tone="blue"
          label="Total Reports"
          value={data.total}
        />
        <StatCard
          icon={Eye}
          tone={publishedCount > 0 ? "green" : "gray"}
          label="Published"
          value={publishedCount}
          sub="visible to clients"
        />
        <StatCard
          icon={EyeOff}
          tone={draftCount > 0 ? "amber" : "gray"}
          label="Draft"
          value={draftCount}
          sub="awaiting review"
        />
        <StatCard
          icon={Users}
          tone="purple"
          label="Clients"
          value={uniqueClients}
          sub={`${totalPostsPublished} posts shipped`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base">All Reports</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = activeFilter === f.value;
              return (
                <Link
                  key={f.value || "all"}
                  href={f.value ? `/reports?filter=${f.value}` : "/reports"}
                  scroll={false}
                  className={
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
                    (active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted")
                  }
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Calendar className="mx-auto mb-3 size-8 text-muted-foreground/40" />
              <p className="font-medium">
                {items.length === 0
                  ? "No reports yet"
                  : `No ${activeFilter || ""} reports`}
              </p>
              {items.length === 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Reports get generated by the monthly cron, or trigger one manually
                  with{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    /api/cron/monthly-reports
                  </code>
                  .
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {visible.map((row) => {
                const report = row.report;
                const onSchedule = report.blogsOnSchedule ?? 0;
                const offSchedule = report.blogsOffSchedule ?? 0;
                const totalBlogs = onSchedule + offSchedule;
                return (
                  <Link
                    key={report.id}
                    href={`/reports/${report.id}`}
                    className="block transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-4 p-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
                        <FileText className="size-5 text-blue-700" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold">
                            {report.title || "Monthly Report"}
                          </span>
                          <Badge
                            variant={
                              report.visibleToClient ? "default" : "outline"
                            }
                            className="text-[10px]"
                          >
                            {report.visibleToClient ? "Published" : "Draft"}
                          </Badge>
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

                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {row.clientName}
                          </span>
                          <span className="mx-1.5">·</span>
                          {formatDate(report.periodStart)} →{" "}
                          {formatDate(report.periodEnd)}
                          {report.generatedAt && (
                            <>
                              <span className="mx-1.5">·</span>
                              generated {formatDate(report.generatedAt)}
                            </>
                          )}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs">
                          <Metric
                            label="Avg SEO"
                            value={
                              report.avgSeoScore != null
                                ? String(report.avgSeoScore)
                                : "—"
                            }
                            valueColor={scoreColor(report.avgSeoScore)}
                          />
                          <Metric
                            label="Posts"
                            value={String(report.totalPostsPublished ?? 0)}
                          />
                          <Metric
                            label="Issues fixed"
                            value={String(report.totalIssuesFixed ?? 0)}
                          />
                          {totalBlogs > 0 && (
                            <Metric
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
                      </div>

                      <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
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
}: {
  icon: typeof Globe;
  tone: Tone;
  label: string;
  value: string | number;
  sub?: string;
}) {
  const t = STAT_TONE[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <div className={`flex size-7 items-center justify-center rounded-full ${t.iconBg}`}>
            <Icon className={`size-3.5 ${t.iconColor}`} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-semibold ${valueColor ?? ""}`}>{value}</span>
    </div>
  );
}
