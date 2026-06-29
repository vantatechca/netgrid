"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  applyThemeSeoFix,
  inspectThemeSeo,
  fixThemeMetaDescription,
} from "@/lib/actions/theme-seo-actions";
import { Code2, Search, FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type {
  ThemeSeoResult,
  ThemeSeoInspection,
} from "@/lib/services/shopify-theme-client";

interface ThemeSeoButtonProps {
  blogId: string;
}

const SOURCE_LABEL: Record<NonNullable<ThemeSeoInspection["descriptionSource"]>, string> = {
  seo_field: "✓ uses the SEO field (page_description) — correct",
  body: "✗ uses the article body — this is why audits see the long text",
  excerpt: "uses the article excerpt (summary_html)",
  unknown: "could not classify — see the lines below",
};

export function ThemeSeoButton({ blogId }: ThemeSeoButtonProps) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"apply" | "inspect" | "fixdesc" | null>(null);
  const [result, setResult] = useState<ThemeSeoResult | null>(null);
  const [inspection, setInspection] = useState<ThemeSeoInspection | null>(null);

  function run(which: "apply" | "inspect" | "fixdesc") {
    setResult(null);
    setInspection(null);
    setBusy(which);
    start(async () => {
      try {
        if (which === "inspect") {
          setInspection(await inspectThemeSeo(blogId));
        } else if (which === "fixdesc") {
          setResult(await fixThemeMetaDescription(blogId));
        } else {
          setResult(await applyThemeSeoFix(blogId));
        }
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Edit the store&apos;s published theme for SEO. <strong>Inspect</strong>{" "}
        shows how the theme builds its meta description;{" "}
        <strong>Fix meta description</strong> repoints it at the capped SEO
        value (instead of the article body); <strong>Apply OG / JSON-LD</strong>{" "}
        installs the Open Graph <code>article:*</code> tags + <code>BlogPosting</code>{" "}
        schema. All are idempotent. Requires the app&apos;s read_themes /
        write_themes scopes.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => run("inspect")} disabled={pending}>
          {busy === "inspect" ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <Search className="size-4" data-icon="inline-start" />
          )}
          Inspect
        </Button>
        <Button variant="outline" onClick={() => run("fixdesc")} disabled={pending}>
          {busy === "fixdesc" ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <FileText className="size-4" data-icon="inline-start" />
          )}
          Fix meta description
        </Button>
        <Button variant="outline" onClick={() => run("apply")} disabled={pending}>
          {busy === "apply" ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <Code2 className="size-4" data-icon="inline-start" />
          )}
          Apply OG / JSON-LD
        </Button>
      </div>

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

      {inspection && (
        <div
          className={`space-y-2 rounded-lg border p-3 ${
            inspection.success
              ? "border-border bg-muted/30"
              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
          }`}
        >
          <p className="text-sm font-medium">{inspection.message}</p>
          {inspection.success && (
            <>
              {inspection.descriptionSource && (
                <p className="text-xs">
                  <span className="font-medium">Meta description source: </span>
                  <span
                    className={
                      inspection.descriptionSource === "seo_field"
                        ? "text-green-600"
                        : inspection.descriptionSource === "body"
                          ? "text-red-600"
                          : "text-amber-600"
                    }
                  >
                    {SOURCE_LABEL[inspection.descriptionSource]}
                  </span>
                </p>
              )}
              {inspection.descriptionLines && inspection.descriptionLines.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Description lines ({inspection.asset}):
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
                    {inspection.descriptionLines.join("\n")}
                  </pre>
                </div>
              )}
              {inspection.titleLines && inspection.titleLines.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Title lines:
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
                    {inspection.titleLines.join("\n")}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
