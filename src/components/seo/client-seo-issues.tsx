"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Wrench,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export interface ClientSeoIssue {
  id: string;
  blogId: string;
  blogDomain: string;
  severity: string;
  category: string;
  title: string;
  pageUrl: string | null;
  autoFixable: boolean;
}

interface ClientSeoIssuesProps {
  clientId: string;
  total: number;
  issues: ClientSeoIssue[];
}

const severityVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  critical: "destructive",
  warning: "secondary",
  notice: "outline",
};

type RowState = "idle" | "fixing" | "fixed" | "failed";

export function ClientSeoIssues({
  clientId,
  total,
  issues: initialIssues,
}: ClientSeoIssuesProps) {
  const [issues, setIssues] = useState(initialIssues);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchPending, startBatch] = useTransition();

  const autoFixableCount = useMemo(
    () => issues.filter((i) => i.autoFixable).length,
    [issues],
  );

  function setRow(id: string, state: RowState) {
    setRowState((prev) => ({ ...prev, [id]: state }));
  }

  async function fixOne(issueId: string) {
    setBusyId(issueId);
    setRow(issueId, "fixing");
    const toastId = toast.loading("Applying fix…");
    try {
      const res = await fetch("/api/seo/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", issueId }),
      });
      const data = await res.json();
      if (res.ok && data.applied) {
        setRow(issueId, "fixed");
        toast.success(data.message || "Fixed", { id: toastId });
      } else {
        setRow(issueId, "failed");
        toast.error(data.message || data.error || "Could not fix", {
          id: toastId,
        });
      }
    } catch {
      setRow(issueId, "failed");
      toast.error("Network error", { id: toastId });
    } finally {
      setBusyId(null);
    }
  }

  function fixAll() {
    if (autoFixableCount === 0) {
      toast.info("No auto-fixable issues for this client.");
      return;
    }
    startBatch(async () => {
      const toastId = toast.loading(
        `Fixing ${autoFixableCount} auto-fixable issue${autoFixableCount === 1 ? "" : "s"}…`,
      );
      try {
        const res = await fetch("/api/seo/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "applyAll", clientId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Fix-all failed", { id: toastId });
          return;
        }
        const applied = data.applied ?? 0;
        const failed = data.failed ?? 0;
        // Mark every auto-fixable row applied optimistically; failures are
        // surfaced via the toast and will reappear on the next scan.
        setIssues((prev) =>
          prev.map((i) =>
            i.autoFixable ? { ...i, autoFixable: false } : i,
          ),
        );
        setRowState((prev) => {
          const next = { ...prev };
          for (const i of issues) if (i.autoFixable) next[i.id] = "fixed";
          return next;
        });
        if (applied > 0)
          toast.success(`Applied ${applied} fix${applied === 1 ? "" : "es"}`, {
            id: toastId,
          });
        else toast.info("No fixes applied", { id: toastId });
        if (failed > 0)
          toast.error(`${failed} fix${failed === 1 ? "" : "es"} failed`);
      } catch {
        toast.error("Network error during fix-all", { id: toastId });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total} unresolved issue{total === 1 ? "" : "s"}
          {autoFixableCount > 0 && (
            <> · {autoFixableCount} auto-fixable</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={fixAll}
            disabled={batchPending || autoFixableCount === 0}
            title={
              autoFixableCount === 0
                ? "No auto-fixable issues — performance audits (render-blocking, LCP, etc.) can't be fixed from here."
                : undefined
            }
          >
            {batchPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wrench className="size-4" />
            )}
            Fix all{autoFixableCount > 0 ? ` (${autoFixableCount})` : ""}
          </Button>
          <Link href={`/seo/fix-queue?clientId=${clientId}`}>
            <Button variant="outline" size="sm">
              Fix Queue
            </Button>
          </Link>
        </div>
      </div>

      {issues.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No open issues — nice.
        </p>
      ) : (
        <div className="space-y-2">
          {issues.slice(0, 10).map((issue) => {
            const state = rowState[issue.id] ?? "idle";
            return (
              <div
                key={issue.id}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                {state === "fixed" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                ) : state === "failed" ? (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={severityVariant[issue.severity] ?? "outline"}>
                      {issue.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {issue.category}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {issue.blogDomain}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{issue.title}</p>
                  {issue.pageUrl && (
                    <p className="truncate text-xs text-muted-foreground">
                      {issue.pageUrl}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {state === "fixed" ? (
                    <span className="text-xs font-medium text-green-600">
                      Fixed
                    </span>
                  ) : issue.autoFixable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fixOne(issue.id)}
                      disabled={busyId === issue.id || batchPending}
                    >
                      {busyId === issue.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Wrench className="size-3.5" />
                      )}
                      Fix Issue
                    </Button>
                  ) : (
                    <span
                      className="text-xs text-muted-foreground"
                      title="This issue type can't be auto-fixed from the content API (e.g. performance/Lighthouse audits)."
                    >
                      Manual
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {issues.length > 10 && (
            <p className="pt-2 text-center text-xs text-muted-foreground">
              Showing first 10 of {total} issues.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
