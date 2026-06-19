import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  FileText,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// Shared presentational pieces for the admin Reports pages (network overview
// and per-client). Plain server-renderable functions — no client state.

export type Tone = "blue" | "green" | "red" | "amber" | "purple" | "gray";

export const STAT_TONE: Record<Tone, { iconBg: string; iconColor: string }> = {
  blue: { iconBg: "bg-blue-100", iconColor: "text-blue-700" },
  green: { iconBg: "bg-green-100", iconColor: "text-green-700" },
  red: { iconBg: "bg-red-100", iconColor: "text-red-700" },
  amber: { iconBg: "bg-amber-100", iconColor: "text-amber-700" },
  purple: { iconBg: "bg-purple-100", iconColor: "text-purple-700" },
  gray: { iconBg: "bg-muted", iconColor: "text-muted-foreground" },
};

export function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
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
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <div
            className={`flex size-7 items-center justify-center rounded-full ${t.iconBg}`}
          >
            <Icon className={`size-3.5 ${t.iconColor}`} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function Metric({
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

export function formatReportDate(d: Date | string | null): string {
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

export function trendBadgeClass(trend: string | null): string {
  if (trend === "improving")
    return "bg-green-100 text-green-800 hover:bg-green-100 border-transparent";
  if (trend === "declining")
    return "bg-red-100 text-red-800 hover:bg-red-100 border-transparent";
  return "bg-muted text-muted-foreground hover:bg-muted border-transparent";
}

export function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="size-3" />;
  if (trend === "declining") return <TrendingDown className="size-3" />;
  return <Minus className="size-3" />;
}

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

/** Format a USD amount — more precision for sub-dollar averages. */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (n === 0) return "$0.00";
  if (Math.abs(n) < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface ReportRowData {
  id: string;
  title: string | null;
  visibleToClient: boolean | null;
  overallSeoTrend: string | null;
  periodStart: string | Date | null;
  periodEnd: string | Date | null;
  generatedAt: string | Date | null;
  avgSeoScore: number | null;
  totalPostsPublished: number | null;
  totalIssuesFixed: number | null;
  blogsOnSchedule: number | null;
  blogsOffSchedule: number | null;
  totalCostUsd?: string | number | null;
}

/** A single report as a clickable row linking to its detail page. */
export function ReportRow({
  report,
  clientName,
}: {
  report: ReportRowData;
  clientName?: string;
}) {
  const onSchedule = report.blogsOnSchedule ?? 0;
  const offSchedule = report.blogsOffSchedule ?? 0;
  const totalBlogs = onSchedule + offSchedule;

  return (
    <Link
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
              variant={report.visibleToClient ? "default" : "outline"}
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
            {clientName && (
              <>
                <span className="font-medium text-foreground">{clientName}</span>
                <span className="mx-1.5">·</span>
              </>
            )}
            {formatReportDate(report.periodStart)} →{" "}
            {formatReportDate(report.periodEnd)}
            {report.generatedAt && (
              <>
                <span className="mx-1.5">·</span>
                generated {formatReportDate(report.generatedAt)}
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs">
            <Metric
              label="Avg SEO"
              value={report.avgSeoScore != null ? String(report.avgSeoScore) : "—"}
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
            {report.totalCostUsd != null && (
              <Metric label="Cost" value={fmtUsd(Number(report.totalCostUsd))} />
            )}
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
}
