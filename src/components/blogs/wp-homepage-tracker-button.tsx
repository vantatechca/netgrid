"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { installWpHomepageTracker } from "@/lib/actions/wp-tracking-actions";
import type { WpHomepageTrackerResult } from "@/lib/actions/wp-tracking-actions";
import { Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface WpHomepageTrackerButtonProps {
  blogId: string;
}

export function WpHomepageTrackerButton({
  blogId,
}: WpHomepageTrackerButtonProps) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<WpHomepageTrackerResult | null>(null);

  function run() {
    setResult(null);
    start(async () => {
      setResult(await installWpHomepageTracker(blogId));
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Embed a page-view pixel on the site&apos;s homepage so visitors who
        never open a blog post still count toward Page Views. Works when the
        homepage is a <strong>static page</strong> (Settings → Reading);
        idempotent — safe to re-run.
      </p>

      <Button onClick={run} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <Activity className="size-4" data-icon="inline-start" />
        )}
        Install homepage tracker
      </Button>

      {result && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-3 ${
            result.success
              ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
          }`}
        >
          {result.success ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
          ) : (
            <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
          )}
          <p
            className={`text-sm ${
              result.success
                ? "text-green-800 dark:text-green-200"
                : "text-red-800 dark:text-red-200"
            }`}
          >
            {result.message}
          </p>
        </div>
      )}
    </div>
  );
}
