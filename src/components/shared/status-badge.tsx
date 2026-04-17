import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = "client" | "blog" | "invoice" | "issue" | "alert";

interface StatusConfig {
  className: string;
}

const statusMap: Record<StatusType, Record<string, StatusConfig>> = {
  client: {
    active: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    inactive: { className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
    pending: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    churned: { className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  },
  blog: {
    live: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    draft: { className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
    scheduled: { className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    expired: { className: "bg-red-500/15 text-red-700 dark:text-red-400" },
    flagged: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  },
  invoice: {
    paid: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    pending: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    overdue: { className: "bg-red-500/15 text-red-700 dark:text-red-400" },
    draft: { className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
    cancelled: { className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
  },
  issue: {
    open: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    in_progress: { className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    resolved: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
    closed: { className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
    critical: { className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  },
  alert: {
    info: { className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
    warning: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    error: { className: "bg-red-500/15 text-red-700 dark:text-red-400" },
    success: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  },
};

const fallbackConfig: StatusConfig = {
  className: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

interface StatusBadgeProps {
  status: string;
  type: StatusType;
  className?: string;
}

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/\s+/g, "_");
  const config = statusMap[type]?.[normalizedStatus] ?? fallbackConfig;

  const label = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent font-medium",
        config.className,
        className
      )}
    >
      {label}
    </Badge>
  );
}
