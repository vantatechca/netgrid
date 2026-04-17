"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { testBlogConnection } from "@/lib/actions/blog-actions";
import { Wifi, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { WpConnectionResult } from "@/lib/types";

interface WpConnectionTestProps {
  blogId: string;
}

export function WpConnectionTest({ blogId }: WpConnectionTestProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<WpConnectionResult | null>(null);

  const handleTest = () => {
    setResult(null);
    startTransition(async () => {
      const res = await testBlogConnection(blogId);
      setResult(res);
    });
  };

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        onClick={handleTest}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <Wifi className="size-4" data-icon="inline-start" />
        )}
        {isPending ? "Testing..." : "Test Connection"}
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
                result.success ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"
              }`}
            >
              {result.success ? "Connection Successful" : "Connection Failed"}
            </p>
            <p className="text-sm text-muted-foreground">{result.message}</p>
            {result.success && (
              <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
                {result.wpVersion && (
                  <span>WordPress: {result.wpVersion}</span>
                )}
                {result.seoPlugin && result.seoPlugin !== "none" && (
                  <span>SEO Plugin: {result.seoPlugin}</span>
                )}
                {result.userRole && (
                  <span>Role: {result.userRole}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
