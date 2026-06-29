"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, Sparkles, Wrench, ScanSearch } from "lucide-react";
import { toast } from "sonner";

type FixQueueItem = {
  issue: {
    id: string;
    title: string;
    description: string | null;
    severity: string;
    category: string;
    pageUrl: string | null;
    autoFixable: boolean | null;
    suggestedFix: string | null;
    status: string;
  };
  blogDomain: string;
  blogId: string;
};

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  warning: "secondary",
  notice: "outline",
};

function FixQueueInner() {
  const params = useSearchParams();
  const clientId = params.get("clientId") || undefined;
  const blogId = params.get("blogId") || undefined;

  const scopeQuery = new URLSearchParams();
  if (clientId) scopeQuery.set("clientId", clientId);
  if (blogId) scopeQuery.set("blogId", blogId);
  const scopeSuffix = scopeQuery.toString() ? `?${scopeQuery.toString()}` : "";

  const [queue, setQueue] = useState<FixQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchPending, startBatch] = useTransition();
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [isScanningAll, setIsScanningAll] = useState(false);

  function load(setSpinner: boolean) {
    if (setSpinner) setLoading(true);
    fetch(`/api/seo/fix-queue${scopeSuffix}`)
      .then((r) => r.json())
      .then((data) => setQueue(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load fix queue"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, blogId]);

  function refetch() {
    load(false);
  }

  async function handleScanBlog(id: string, domain: string) {
    setScanningId(id);
    const toastId = toast.loading(`Scanning ${domain}…`);
    try {
      const res = await fetch("/api/seo/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Scan complete — score: ${data.overallScore ?? "n/a"} · ${data.issuesFound ?? 0} issue${data.issuesFound === 1 ? "" : "s"} found`,
          { id: toastId },
        );
        refetch();
      } else {
        toast.error(data.error || "Scan failed", { id: toastId });
      }
    } catch {
      toast.error("Network error during scan", { id: toastId });
    } finally {
      setScanningId(null);
    }
  }

  async function handleScanAll() {
    setIsScanningAll(true);
    const toastId = toast.loading("Scanning all blogs…");
    try {
      const res = await fetch("/api/seo/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanAll: true }),
      });
      const data = await res.json();
      if (res.ok) {
        const scanned = data.scanned ?? 0;
        const failed = data.failed ?? 0;
        toast.success(
          `Scan complete — ${scanned} blog${scanned === 1 ? "" : "s"} scanned${failed > 0 ? ` · ${failed} failed` : ""}`,
          { id: toastId },
        );
        refetch();
      } else {
        toast.error(data.error || "Scan All failed", { id: toastId });
      }
    } catch {
      toast.error("Network error during scan", { id: toastId });
    } finally {
      setIsScanningAll(false);
    }
  }

  async function handleApply(issueId: string) {
    setBusyId(issueId);
    try {
      const res = await fetch("/api/seo/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, action: "apply" }),
      });
      const data = await res.json();
      if (res.ok && data.applied) {
        if (data.score && data.score.newScore !== null) {
          const { previousScore, newScore, delta } = data.score;
          const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
          toast.success(
            `Fix applied · SEO ${previousScore ?? "—"} → ${newScore} ${arrow}${delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}`,
          );
        } else {
          toast.success(data.message || "Fix applied to live site");
        }
        setQueue((q) => q.filter((item) => item.issue.id !== issueId));
      } else {
        toast.error(data.message || data.error || "Could not apply fix");
      }
    } catch {
      toast.error("Network error applying fix");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(issueId: string) {
    setBusyId(issueId);
    try {
      const res = await fetch("/api/seo/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, action: "dismiss" }),
      });
      if (res.ok) {
        setQueue((q) => q.filter((item) => item.issue.id !== issueId));
        toast.success("Issue dismissed");
      } else {
        toast.error("Failed to dismiss");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleGeneratePreview(issueId: string) {
    setBusyId(issueId);
    try {
      const res = await fetch("/api/seo/fix/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      if (res.ok) {
        const data = await res.json();
        setQueue((q) =>
          q.map((item) =>
            item.issue.id === issueId
              ? { ...item, issue: { ...item.issue, suggestedFix: data.fixContent, status: "queued" } }
              : item,
          ),
        );
        toast.success("Preview generated");
      } else {
        toast.error("Failed to generate preview");
      }
    } finally {
      setBusyId(null);
    }
  }

  function handleApplyAll() {
    startBatch(async () => {
      const res = await fetch("/api/seo/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "applyAll", clientId, blogId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Apply All failed");
        return;
      }
      const data = await res.json();
      const applied = data.applied ?? 0;
      const failed = data.failed ?? 0;

      if (applied > 0) toast.success(`Applied ${applied} fix${applied === 1 ? "" : "es"}`);
      if (failed > 0) toast.error(`${failed} fix${failed === 1 ? "" : "es"} failed`);
      if (applied === 0 && failed === 0) toast.info("No auto-fixable issues to apply");

      refetch();
    });
  }

  const severityOrder = { critical: 0, warning: 1, notice: 2 };
  const sorted = [...queue].sort(
    (a, b) =>
      (severityOrder[a.issue.severity as keyof typeof severityOrder] ?? 3) -
      (severityOrder[b.issue.severity as keyof typeof severityOrder] ?? 3),
  );
  const autoFixableCount = sorted.filter((i) => i.issue.autoFixable).length;
  const scoped = Boolean(clientId || blogId);
  const scopeLabel = blogId && sorted[0]?.blogDomain ? sorted[0].blogDomain : undefined;
  const globalBusy = isScanningAll || batchPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          {scoped && (
            <Link
              href="/seo"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> All clients
            </Link>
          )}
          <h1 className="text-2xl font-bold">SEO Fix Queue</h1>
          <p className="text-muted-foreground">
            {scopeLabel ? `${scopeLabel} · ` : scoped ? "Scoped · " : ""}
            {queue.length} issue{queue.length === 1 ? "" : "s"} shown
            {autoFixableCount > 0 && <> · {autoFixableCount} auto-fixable</>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleScanAll} disabled={globalBusy || !!scanningId}>
            {isScanningAll ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            Scan All Blogs
          </Button>
          {autoFixableCount > 0 && (
            <Button onClick={handleApplyAll} disabled={globalBusy || !!scanningId}>
              {batchPending ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
              Apply All ({autoFixableCount})
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="h-24 animate-pulse bg-muted" />
            </Card>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            No pending issues here.{" "}
            <button
              className="underline underline-offset-2 hover:text-foreground transition-colors"
              onClick={handleScanAll}
              disabled={isScanningAll}
            >
              Run a scan
            </button>{" "}
            to find new ones.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const isBusy = busyId === item.issue.id;
            const isScanning = scanningId === item.blogId;
            const canAutoFix = !!item.issue.autoFixable;
            const itemBusy = isBusy || isScanning || globalBusy;

            return (
              <Card key={item.issue.id}>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={severityVariant[item.issue.severity] ?? "outline"}>
                          {item.issue.severity}
                        </Badge>
                        <Badge variant="outline">{item.issue.category}</Badge>
                        {canAutoFix ? (
                          <Badge variant="outline" className="text-green-600">
                            <Sparkles className="size-3 mr-1" />
                            Auto-fixable
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Manual fix
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground truncate">
                          {item.blogDomain}
                        </span>
                      </div>
                      <p className="font-medium">{item.issue.title}</p>
                      {item.issue.pageUrl && (
                        <p className="text-xs text-muted-foreground truncate">{item.issue.pageUrl}</p>
                      )}
                      {item.issue.description && (
                        <p className="text-sm text-muted-foreground">{item.issue.description}</p>
                      )}
                      {item.issue.suggestedFix && (
                        <div className="mt-2 p-2 bg-muted rounded text-sm">
                          <p className="font-medium text-xs mb-1">AI preview:</p>
                          <p>{item.issue.suggestedFix}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleScanBlog(item.blogId, item.blogDomain)}
                        disabled={itemBusy}
                        title={`Re-scan ${item.blogDomain}`}
                      >
                        {isScanning ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
                      </Button>

                      {canAutoFix && (
                        <Button size="sm" onClick={() => handleApply(item.issue.id)} disabled={itemBusy}>
                          {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
                          Apply
                        </Button>
                      )}
                      {canAutoFix && !item.issue.suggestedFix && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGeneratePreview(item.issue.id)}
                          disabled={itemBusy}
                        >
                          Preview
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismiss(item.issue.id)}
                        disabled={itemBusy}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FixQueuePage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
      <FixQueueInner />
    </Suspense>
  );
}
