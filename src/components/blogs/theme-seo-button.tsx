"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { applyThemeSeoFix } from "@/lib/actions/theme-seo-actions";
import { Code2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { ThemeSeoResult } from "@/lib/services/shopify-theme-client";

interface ThemeSeoButtonProps {
  blogId: string;
}

export function ThemeSeoButton({ blogId }: ThemeSeoButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ThemeSeoResult | null>(null);

  const handleApply = () => {
    setResult(null);
    startTransition(async () => {
      const res = await applyThemeSeoFix(blogId);
      setResult(res);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Installs an idempotent, netgrid-managed block into the store&apos;s
        published theme that emits the Open Graph <code>article:*</code> tags and
        a JSON-LD <code>BlogPosting</code> schema the stock theme drops. Safe to
        re-run — it replaces the managed block in place and never touches the
        merchant&apos;s own markup.
      </p>
      <Button variant="outline" onClick={handleApply} disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <Code2 className="size-4" data-icon="inline-start" />
        )}
        {isPending ? "Applying..." : "Apply SEO theme fix"}
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
          <div className="space-y-1">
            <p
              className={`text-sm font-medium ${
                result.success
                  ? "text-green-800 dark:text-green-200"
                  : "text-red-800 dark:text-red-200"
              }`}
            >
              {result.success ? "Theme updated" : "Could not update theme"}
            </p>
            <p className="text-sm text-muted-foreground">{result.message}</p>
            {result.success && (
              <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
                {result.themeName && <span>Theme: {result.themeName}</span>}
                {result.targetAsset && <span>File: {result.targetAsset}</span>}
                {result.action && <span>Action: {result.action}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
