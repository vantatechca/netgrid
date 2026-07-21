import { requireAdmin } from "@/lib/auth/helpers";
import { getLinkExchangeOverview } from "@/lib/actions/link-exchange-actions";
import { ClientOptInToggle } from "@/components/link-exchange/client-opt-in-toggle";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight } from "lucide-react";

const ANCHOR_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  branded: "default",
  naked: "secondary",
  generic: "outline",
  partial: "secondary",
  exact: "destructive",
};

export default async function LinkExchangePage() {
  await requireAdmin();
  const { clients, loops, stats } = await getLinkExchangeOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Link Exchange</h1>
        <p className="text-muted-foreground">
          ABC linking across each client&apos;s own sites. Each loop links a client&apos;s
          blogs A&nbsp;→&nbsp;B&nbsp;→&nbsp;C&nbsp;→&nbsp;A — no two sites link directly to each other,
          and never across different clients.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Clients in network" value={stats.enabledClients} />
        <Stat label="Active loops" value={stats.activeLoops} />
        <Stat label="Links placed" value={stats.edgesPlaced} className="text-green-600" />
        <Stat label="Links pending" value={stats.edgesPending} />
      </div>

      {/* Opt-in */}
      <Card>
        <CardHeader>
          <CardTitle>Participation</CardTitle>
          <CardDescription>
            Opt a client in to link its own active blogs together. A client needs
            at least 3 active sites to form a loop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">In network</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {c.status ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <ClientOptInToggle clientId={c.id} enabled={c.enabled} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Loops */}
      <Card>
        <CardHeader>
          <CardTitle>Active Loops</CardTitle>
          <CardDescription>
            {loops.length === 0
              ? "No loops yet. Opt in a client with ≥3 active sites; loops build on the daily cron."
              : `${loops.length} active loop${loops.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loops.map((loop) => (
            <div key={loop.id} className="rounded-md border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                <span className="text-sm font-medium">
                  {loop.clientName}
                  {loop.niche && (
                    <span className="ml-2 font-normal capitalize text-muted-foreground">
                      · {loop.niche}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {loop.edges.length}-site loop
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Link</TableHead>
                    <TableHead>Anchor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loop.edges.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span>{e.sourceDomain}</span>
                          <ArrowRight className="size-3.5 text-muted-foreground" />
                          <span>{e.targetDomain}</span>
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">
                        {e.targetUrl ? (
                          <a
                            href={e.targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {e.anchorText}
                          </a>
                        ) : (
                          e.anchorText
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ANCHOR_VARIANTS[e.anchorType] ?? "outline"} className="text-xs">
                          {e.anchorType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <Badge
                            variant={e.status === "placed" ? "default" : "outline"}
                            className="text-xs"
                          >
                            {e.status}
                          </Badge>
                          {e.status !== "placed" && e.failureReason && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {e.failureReason}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${className ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
