"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { resetAllSeoTracking } from "@/lib/actions/seo-actions";

/** Scan every active blog, then refresh the hub. */
export function ScanAllButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function scan() {
    start(async () => {
      const toastId = toast.loading("Scanning all blogs…");
      try {
        const res = await fetch("/api/seo/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scanAll: true }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(
            `Scan complete — ${data.scanned ?? 0} blog${data.scanned === 1 ? "" : "s"} scanned${data.failed > 0 ? ` · ${data.failed} failed` : ""}`,
            { id: toastId },
          );
          router.refresh();
        } else {
          toast.error(data.error || "Scan All failed", { id: toastId });
        }
      } catch {
        toast.error("Network error during scan", { id: toastId });
      }
    });
  }

  return (
    <Button variant="outline" onClick={scan} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
      ) : (
        <ScanSearch className="size-4" data-icon="inline-start" />
      )}
      Scan all blogs
    </Button>
  );
}

/**
 * Wipe ALL SEO issues + scans across the network (clean slate). Double
 * confirm because it's irreversible. Per-post scans repopulate afterward.
 */
export function ResetSeoButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function reset() {
    if (
      !window.confirm(
        "Delete ALL SEO issues and scans for every client and start fresh?\n\nThis clears the entire backlog and can't be undone. New issues will be tracked per blog post as posts are published or re-scanned.",
      )
    ) {
      return;
    }
    start(async () => {
      const toastId = toast.loading("Clearing all SEO data…");
      try {
        const res = await resetAllSeoTracking();
        toast.success(
          `Cleared ${res.issues.toLocaleString()} issue${res.issues === 1 ? "" : "s"} and ${res.scans.toLocaleString()} scan${res.scans === 1 ? "" : "s"}. Starting fresh.`,
          { id: toastId },
        );
        router.refresh();
      } catch {
        toast.error("Reset failed", { id: toastId });
      }
    });
  }

  return (
    <Button
      variant="outline"
      onClick={reset}
      disabled={pending}
      className="text-destructive hover:text-destructive"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
      ) : (
        <Trash2 className="size-4" data-icon="inline-start" />
      )}
      Reset
    </Button>
  );
}

interface FixAllButtonProps {
  /** Scope the auto-fix to a client or a single blog. */
  clientId?: string;
  blogId?: string;
  /** How many issues are auto-fixable in this scope (drives label + disabled). */
  count: number;
  label?: string;
  size?: "sm" | "default";
}

/** Apply every auto-fixable issue in a client/blog scope. */
export function FixAllButton({ clientId, blogId, count, label = "Fix all", size = "sm" }: FixAllButtonProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function fixAll() {
    if (count === 0) return;
    start(async () => {
      const toastId = toast.loading(`Fixing ${count} auto-fixable issue${count === 1 ? "" : "s"}…`);
      try {
        const res = await fetch("/api/seo/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "applyAll", clientId, blogId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Fix all failed", { id: toastId });
          return;
        }
        const applied = data.applied ?? 0;
        const failed = data.failed ?? 0;
        if (applied > 0) toast.success(`Applied ${applied} fix${applied === 1 ? "" : "es"}`, { id: toastId });
        else toast.info("No fixes applied", { id: toastId });
        if (failed > 0) toast.error(`${failed} fix${failed === 1 ? "" : "es"} failed`);
        router.refresh();
      } catch {
        toast.error("Network error during fix-all", { id: toastId });
      }
    });
  }

  return (
    <Button
      size={size}
      onClick={fixAll}
      disabled={pending || count === 0}
      title={count === 0 ? "No auto-fixable issues in this scope" : undefined}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
      ) : (
        <Wrench className="size-4" data-icon="inline-start" />
      )}
      {label}
      {count > 0 ? ` (${count})` : ""}
    </Button>
  );
}
