"use client";

import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
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
  clientId: string | null;
  clientName: string | null;
};

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  warning: "secondary",
  notice: "outline",
};

/**
 * Render an audit description, turning the Lighthouse-style `[label](url)`
 * markdown links into real anchors instead of showing raw brackets.
 */
function renderDescription(text: string) {
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a
        key={i++}
        href={m[2]}
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:underline"
      >
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface SiteGroup {
  blogId: string;
  domain: string;
  items: FixQueueItem[];
}
interface ClientGroup {
  clientId: string | null;
  clientName: string;
  sites: SiteGroup[];
  open: number;
  autoFixable: number;
}

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
        // Non-fixable (e.g. demoted to manual) — drop it from the list so the
        // impossible Apply button doesn't linger, and explain why.
        toast.error(data.message || data.error || "Could not apply fix");
        if (data.applied === false && /manual|isn't a blog article/i.test(data.message ?? "")) {
          setQueue((q) =>
            q.map((item) =>
              item.issue.id === issueId
                ? { ...item, issue: { ...item.issue, autoFixable: false } }
                : item,
            ),
          );
        }
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

  function applyAllScoped(scope: { clientId?: string; blogId?: string }, label: string) {
    startBatch(async () => {
      const toastId = toast.loading(`Fixing auto-fixable issues — ${label}…`);
      const res = await fetch("/api/seo/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "applyAll", ...scope }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Apply All failed", { id: toastId });
        return;
      }
      const data = await res.json();
      const applied = data.applied ?? 0;
      const failed = data.failed ?? 0;
      if (applied > 0) toast.success(`Applied ${applied} fix${applied === 1 ? "" : "es"} — ${label}`, { id: toastId });
      else toast.info("No fixes applied", { id: toastId });
      if (failed > 0) toast.error(`${failed} fix${failed === 1 ? "" : "es"} failed`);
      refetch();
    });
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const severityOrder = { critical: 0, warning: 1, notice: 2 };
  const sorted = useMemo(
    () =>
      [...queue].sort(
        (a, b) =>
          (severityOrder[a.issue.severity as keyof typeof severityOrder] ?? 3) -
          (severityOrder[b.issue.severity as keyof typeof severityOrder] ?? 3),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue],
  );

  // Group sorted issues by client → site, preserving worst-first order.
  const groups = useMemo<ClientGroup[]>(() => {
    const byClient = new Map<string, ClientGroup>();
    for (const item of sorted) {
      const cKey = item.clientId ?? "—";
      let cg = byClient.get(cKey);
      if (!cg) {
        cg = {
          clientId: item.clientId,
          clientName: item.clientName ?? "Unassigned",
          sites: [],
          open: 0,
          autoFixable: 0,
        };
        byClient.set(cKey, cg);
      }
      cg.open += 1;
      if (item.issue.autoFixable) cg.autoFixable += 1;
      let sg = cg.sites.find((s) => s.blogId === item.blogId);
      if (!sg) {
        sg = { blogId: item.blogId, domain: item.blogDomain, items: [] };
        cg.sites.push(sg);
      }
      sg.items.push(item);
    }
    return Array.from(byClient.values());
  }, [sorted]);

  const autoFixableCount = sorted.filter((i) => i.issue.autoFixable).length;
  const scoped = Boolean(clientId || blogId);
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
            {queue.length} issue{queue.length === 1 ? "" : "s"} shown
            {autoFixableCount > 0 && <> · {autoFixableCount} auto-fixable</>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleScanAll} disabled={globalBusy || !!scanningId}>
            {isScanningAll ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            Scan all blogs
          </Button>
          {autoFixableCount > 0 && (
            <Button
              onClick={() => applyAllScoped({ clientId, blogId }, "all shown")}
              disabled={globalBusy || !!scanningId}
            >
              {batchPending ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
              Fix all ({autoFixableCount})
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
      ) : groups.length === 0 ? (
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
        <div className="space-y-8">
          {groups.map((client) => (
            <section key={client.clientId ?? "—"} className="space-y-3">
              {/* Client header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{client.clientName}</h2>
                  <span className="text-xs text-muted-foreground">
                    {client.open} open
                    {client.autoFixable > 0 && <> · {client.autoFixable} auto-fixable</>}
                  </span>
                </div>
                {client.clientId && client.autoFixable > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyAllScoped({ clientId: client.clientId! }, client.clientName)}
                    disabled={globalBusy || !!scanningId}
                  >
                    <Wrench className="size-3.5" />
                    Fix all ({client.autoFixable})
                  </Button>
                )}
              </div>

              {/* Sites within the client */}
              {client.sites.map((site) => (
                <Card key={site.blogId}>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                      <span className="truncate text-sm font-medium">{site.domain}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {site.items.length} issue{site.items.length === 1 ? "" : "s"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleScanBlog(site.blogId, site.domain)}
                          disabled={globalBusy || scanningId === site.blogId}
                          title={`Re-scan ${site.domain}`}
                        >
                          {scanningId === site.blogId ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ScanSearch className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <ul className="divide-y">
                      {site.items.map((item) => {
                        const isBusy = busyId === item.issue.id;
                        const canAutoFix = !!item.issue.autoFixable;
                        const itemBusy = isBusy || globalBusy;
                        return (
                          <li
                            key={item.issue.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={severityVariant[item.issue.severity] ?? "outline"}>
                                  {item.issue.severity}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{item.issue.category}</span>
                                {canAutoFix ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                    <Sparkles className="size-3" /> Auto-fixable
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Manual</span>
                                )}
                              </div>
                              <p className="text-sm font-medium">{item.issue.title}</p>
                              {item.issue.pageUrl && (
                                <p className="truncate text-xs text-muted-foreground">{item.issue.pageUrl}</p>
                              )}
                              {item.issue.description && (
                                <p className="text-xs text-muted-foreground">
                                  {renderDescription(item.issue.description)}
                                </p>
                              )}
                              {item.issue.suggestedFix && (
                                <div className="mt-1 rounded bg-muted p-2 text-xs">
                                  <span className="font-medium">AI preview: </span>
                                  {item.issue.suggestedFix}
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {canAutoFix && (
                                <Button
                                  size="sm"
                                  onClick={() => handleApply(item.issue.id)}
                                  disabled={itemBusy}
                                  title="Auto-fix via the Shopify / WordPress API"
                                >
                                  {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
                                  Fix
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
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </section>
          ))}
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
