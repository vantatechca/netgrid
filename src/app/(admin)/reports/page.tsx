import Link from "next/link";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  getReports,
  getCostAnalytics,
  getClientReportSummaries,
  type CostWindow,
} from "@/lib/actions/report-actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  StatCard,
  ReportRow,
  TrendIcon,
  trendBadgeClass,
  fmtUsd,
  formatReportDate,
} from "@/components/reports/report-pieces";
import { Badge } from "@/components/ui/badge";
import { TriggerReportsButton } from "@/components/reports/trigger-reports-button";
import {
  Calendar,
  ChevronRight,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Receipt,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const WINDOWS = [
  { value: "all", label: "All time" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
] as const;

function reportsHref(p: { filter?: string; window?: string }): string {
  const sp = new URLSearchParams();
  if (p.filter) sp.set("filter", p.filter);
  if (p.window && p.window !== "all") sp.set("window", p.window);
  const qs = sp.toString();
  return qs ? `/reports?${qs}` : "/reports";
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: { filter?: string; window?: string };
}) {
  await requireAdmin();

  const activeWindow: CostWindow =
    (WINDOWS.find((w) => w.value === searchParams?.window)?.value as CostWindow) ??
    "all";

  const [data, cost, clientSummaries] = await Promise.all([
    getReports({ pageSize: 100 }),
    getCostAnalytics({ window: activeWindow }),
    getClientReportSummaries(activeWindow),
  ]);
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
        <StatCard icon={FileText} tone="blue" label="Total Reports" value={data.total} />
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

      {/* Cost analytics */}
      <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Generation Cost</h2>
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => {
            const active = activeWindow === w.value;
            return (
              <Link
                key={w.value}
                href={reportsHref({ filter: activeFilter, window: w.value })}
                scroll={false}
                className={
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-muted")
                }
              >
                {w.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={DollarSign}
          tone="green"
          label="Total Spend"
          value={fmtUsd(cost.totalCostUsd)}
          sub={
            activeWindow === "all"
              ? "generation cost, all time"
              : activeWindow === "30d"
                ? "last 30 days"
                : "this month"
          }
        />
        <StatCard
          icon={Layers}
          tone="blue"
          label="Avg Cost / Blog"
          value={fmtUsd(cost.avgCostPerBlog)}
          sub={`${cost.blogCount} blog${cost.blogCount === 1 ? "" : "s"} generating`}
        />
        <StatCard
          icon={Receipt}
          tone="blue"
          label="Avg Cost / Post"
          value={fmtUsd(cost.avgCostPerPost)}
          sub="text + images"
        />
        <StatCard
          icon={FileText}
          tone="gray"
          label="Posts Generated"
          value={cost.postCount}
          sub="across all blogs"
        />
      </div>
      </div>

      {/* By client */}
      {clientSummaries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">By Client</h2>
            <p className="text-xs text-muted-foreground">
              {clientSummaries.length} client
              {clientSummaries.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clientSummaries.map((c) => (
              <Link
                key={c.clientId}
                href={`/reports/client/${c.clientId}`}
                className="group block"
              >
                <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/30">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold" title={c.clientName}>
                          {c.clientName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.reportCount} report{c.reportCount === 1 ? "" : "s"}
                          {c.latestReportAt && (
                            <> · latest {formatReportDate(c.latestReportAt)}</>
                          )}
                        </p>
                      </div>
                      {c.latestTrend ? (
                        <Badge
                          className={
                            "flex shrink-0 items-center gap-1 text-[10px] " +
                            trendBadgeClass(c.latestTrend)
                          }
                        >
                          <TrendIcon trend={c.latestTrend} />
                          {c.latestTrend}
                        </Badge>
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                      <ClientStat label="Spend" value={fmtUsd(c.totalCostUsd)} />
                      <ClientStat label="Avg / blog" value={fmtUsd(c.avgCostPerBlog)} />
                      <ClientStat label="Posts" value={String(c.postCount)} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base">All Reports</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = activeFilter === f.value;
              return (
                <Link
                  key={f.value || "all"}
                  href={reportsHref({ filter: f.value, window: activeWindow })}
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
              {visible.map((row) => (
                <ReportRow
                  key={row.report.id}
                  report={row.report}
                  clientName={row.clientName}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
