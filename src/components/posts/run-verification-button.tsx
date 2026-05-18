"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runPostVerificationNow } from "@/lib/actions/post-verification-actions";

export function RunVerificationButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await runPostVerificationNow();
        const alertText =
          result.alerts > 0
            ? `, ${result.alerts} off schedule`
            : "";
        toast.success(
          `Verified ${result.verified}/${result.total} blog${result.total === 1 ? "" : "s"}${alertText}`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Verification failed");
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending} size="sm">
      {isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 size-4" />
      )}
      {isPending ? "Checking…" : "Run Verification Now"}
    </Button>
  );
}
