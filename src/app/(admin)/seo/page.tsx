import Link from "next/link";
import { getSeoTrackingSummary } from "@/lib/actions/seo-actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListChecks, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ScanAllButton, FixAllButton } from "@/components/seo/seo-hub-actions";

export const dynamic = "force-dynamic";

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function formatDate(d: Date | null): string {
  if (!d) return "never";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
          <h1 className="text-2xl font-bold">SEO</h1>
          <p className="text-muted-foreground">
            Fix status by client and site. Fix auto-fixable issues per client,
            or open a site&apos;s full queue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScanAllButton />
          <Link
            href="/seo/fix-queue"
            className="text-sm font-medium text-primary hover:underline"
          >
            Open full queue →
          </Link>
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
        clients.map((client) => (
          <Card key={client.clientId}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {client.clientName}
                    {client.status && (
                      <Badge variant="outline" className="font-normal">
                        {client.status}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {client.totals.sites} site{client.totals.sites === 1 ? "" : "s"}
                    {client.totals.avgScore !== null && <> · avg score {client.totals.avgScore}</>}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    <ListChecks className="size-3.5" />
                    {client.totals.openIssues} open
                  </span>
                  {client.totals.criticalOpen > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="size-3.5" />
                      {client.totals.criticalOpen} critical
                    </span>
                  )}
                  {client.totals.fixed > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="size-3.5" />
                      {client.totals.fixed} fixed
                    </span>
                  )}
                  <FixAllButton
                    clientId={client.clientId}
                    count={client.totals.autoFixableOpen}
                  />
                  <Link
                    href={`/seo/fix-queue?clientId=${client.clientId}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Wrench className="size-3.5" />
                    Queue
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Critical</TableHead>
                    <TableHead className="text-right">Auto-fixable</TableHead>
                    <TableHead className="text-right">Fixed</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Last scan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.sites.map((site) => (
                    <TableRow key={site.blogId}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/seo/fix-queue?clientId=${client.clientId}&blogId=${site.blogId}`}
                          className="hover:underline"
                        >
                          {site.domain}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {site.platform}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${scoreTone(site.score)}`}>
                        {site.score ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{site.openIssues}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {site.criticalOpen > 0 ? (
                          <span className="text-red-600">{site.criticalOpen}</span>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {site.autoFixableOpen > 0 ? (
                          <span className="text-primary">{site.autoFixableOpen}</span>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">
                        {site.fixed || 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {site.failed > 0 ? <span className="text-red-600">{site.failed}</span> : 0}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(site.lastScanAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
