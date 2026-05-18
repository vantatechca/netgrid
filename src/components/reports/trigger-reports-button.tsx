"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { triggerMonthlyReportsManual } from "@/lib/actions/report-actions";

type Period = "last_30_days" | "last_month" | "month_to_date";

const PERIODS: { value: Period; label: string; sub: string }[] = [
  {
    value: "last_30_days",
    label: "Last 30 days",
    sub: "rolling window — best for testing",
  },
  {
    value: "last_month",
    label: "Last calendar month",
    sub: "matches the production cron schedule",
  },
  {
    value: "month_to_date",
    label: "Month to date",
    sub: "from the 1st to today",
  },
];

export function TriggerReportsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function trigger(period: Period) {
    startTransition(async () => {
      try {
        const result = await triggerMonthlyReportsManual({ period });

        if (result.generated > 0) {
          const emailedLine =
            result.emailed > 0
              ? ` · emailed ${result.emailed} client${result.emailed === 1 ? "" : "s"}`
              : "";
          toast.success(
            `Generated ${result.generated} report${
              result.generated === 1 ? "" : "s"
            } for ${result.period.start} → ${result.period.end}${emailedLine}`,
          );
        }
        if (result.emailFailed > 0) {
          toast.warning(
            `${result.emailFailed} email${
              result.emailFailed === 1 ? "" : "s"
            } didn't send — check console for per-client reasons (often missing clients.contact_email or RESEND_API_KEY)`,
          );
          for (const r of result.results.filter(
            (x) => x.email && !x.email.success,
          )) {
            console.warn(`[${r.clientName}] email:`, r.email?.message);
          }
        }
        if (result.failed > 0) {
          toast.error(
            `${result.failed} report${result.failed === 1 ? "" : "s"} failed — see dev console for per-client reasons`,
          );
          for (const r of result.results.filter((x) => x.status === "failed")) {
            console.error(`[${r.clientName}]`, r.message);
          }
        }
        if (result.generated === 0 && result.failed === 0) {
          toast.info("No eligible clients (need status = active or onboarding)");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Trigger failed");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "Generating…" : "Generate reports"}
          <ChevronDown className="ml-1 size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Pick a period</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PERIODS.map((p) => (
          <DropdownMenuItem
            key={p.value}
            onSelect={() => trigger(p.value)}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="text-sm font-medium">{p.label}</span>
            <span className="text-xs text-muted-foreground">{p.sub}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
