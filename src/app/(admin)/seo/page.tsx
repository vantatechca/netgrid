import Link from "next/link";
import { getSeoTrackingSummary } from "@/lib/actions/seo-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { ScanAllButton, ResetSeoButton } from "@/components/seo/seo-hub-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "SEO Fix" };

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "default" | "amber" | "red" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "green"
          ? "text-green-600"
          : "text-foreground";
  return (
    <div className="flex flex-col">
      <span className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function SeoHubPage() {
  const { clients, grand } = await getSeoTrackingSummary();

  return (
    <div className="space-y-6">
      {/* Header + global actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">SEO Fix</h1>
          <p className="text-muted-foreground">
            Fix status by client. Open a client to fix their sites&apos; issues.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanAllButton />
          <ResetSeoButton />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-4 py-5">
          <Stat label="Clients" value={grand.clients} />
          <Stat label="Sites" value={grand.sites} />
          <Stat label="Open issues" value={grand.openIssues} tone="amber" />
          <Stat label="Critical open" value={grand.criticalOpen} tone="red" />
          <Stat label="Auto-fixable now" value={grand.autoFixableOpen} />
          <Stat label="Fixed" value={grand.fixed} tone="green" />
          <Stat label="Failed" value={grand.failed} tone="red" />
        </CardContent>
      </Card>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No sites tracked yet. Run an SEO scan to populate the queue.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link
              key={client.clientId}
              href={`/seo/clients/${client.clientId}`}
              className="group block"
            >
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="space-y-4 py-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold group-hover:text-primary">
                        {client.clientName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {client.totals.sites} site{client.totals.sites === 1 ? "" : "s"}
                        {client.totals.avgScore !== null && (
                          <> · avg score {client.totals.avgScore}</>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {client.status && (
                        <Badge variant="outline" className="font-normal">
                          {client.status}
                        </Badge>
                      )}
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-y-3">
                    <Stat label="Open" value={client.totals.openIssues} tone="amber" />
                    <Stat label="Critical" value={client.totals.criticalOpen} tone="red" />
                    <Stat
                      label="Auto-fixable"
                      value={client.totals.autoFixableOpen}
                    />
                    <Stat label="Fixed" value={client.totals.fixed} tone="green" />
                    <Stat label="Failed" value={client.totals.failed} tone="red" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
