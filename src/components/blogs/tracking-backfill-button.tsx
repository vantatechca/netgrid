"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { backfillBlogTracking } from "@/lib/actions/tracking-backfill-actions";
import type { TrackingBackfillResult } from "@/lib/actions/tracking-backfill-actions";
import { History, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface TrackingBackfillButtonProps {
  blogId: string;
}

export function TrackingBackfillButton({ blogId }: TrackingBackfillButtonProps) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TrackingBackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setResult(null);
    setError(null);
    start(async () => {
      try {
        setResult(await backfillBlogTracking(blogId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Backfill failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add tracking to posts published <strong>before</strong> tracking
        existed: repoints each post&apos;s CTA through the tracked redirect and
        adds the page-view pixel. Reads each live post and only writes when
        something changes — safe to re-run. Processes the newest ~60 posts per
        run; if more remain, just run it again.
      </p>

      <Button onClick={run} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <History className="size-4" data-icon="inline-start" />
        )}
        Backfill tracking on published posts
      </Button>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-green-800 dark:text-green-200">
              {result.updated} updated · {result.skipped} already tracked ·{" "}
              {result.failed} failed
            </p>
            <p className="text-muted-foreground">
              Processed {result.total} published post
              {result.total === 1 ? "" : "s"}.
              {result.remaining > 0
                ? ` ${result.remaining} more remain — run again to finish them.`
                : " All published posts covered."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
