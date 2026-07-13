"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MapPin, Play, RefreshCw, Save, Hammer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  updateClientLocations,
  updateClientDosages,
  setLocationCampaign,
  buildLocationMatrix,
  retryFailedLocationTargets,
  generateLocationPagesNow,
  type LocationCampaignView,
} from "@/lib/actions/location-actions";

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  generated: "default",
  pending: "secondary",
  failed: "destructive",
};

export function LocationPagesPanel({
  clientId,
  view,
}: {
  clientId: string;
  view: LocationCampaignView;
}) {
  const router = useRouter();
  const [locations, setLocations] = useState(view.locations);
  const [dosages, setDosages] = useState(view.dosages);
  const [enabled, setEnabled] = useState(view.enabled);
  const [perDay, setPerDay] = useState(String(view.perDay));
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<null | "save" | "dosages" | "build" | "retry" | "now">(null);

  if (!view.isPeptides) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Location pages are available for <strong>peptides</strong> clients only.
        </CardContent>
      </Card>
    );
  }

  async function saveLocations() {
    setBusy("save");
    const res = await updateClientLocations(clientId, locations);
    setBusy(null);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    router.refresh();
  }

  async function saveDosages() {
    setBusy("dosages");
    const res = await updateClientDosages(clientId, dosages);
    setBusy(null);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    router.refresh();
  }

  function saveCampaign(next: { enabled?: boolean; perDay?: number }) {
    start(async () => {
      const res = await setLocationCampaign(clientId, next);
      if (!res.success) toast.error(res.message);
      router.refresh();
    });
  }

  async function build() {
    setBusy("build");
    const res = await buildLocationMatrix(clientId);
    setBusy(null);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    router.refresh();
  }

  async function retry() {
    setBusy("retry");
    const res = await retryFailedLocationTargets(clientId);
    setBusy(null);
    toast.success(`Requeued ${res.requeued} failed page${res.requeued === 1 ? "" : "s"}.`);
    router.refresh();
  }

  async function generateNow() {
    setBusy("now");
    const toastId = toast.loading("Generating a few location pages…", {
      description: "Full articles — this can take a minute.",
    });
    try {
      const res = await generateLocationPagesNow(clientId);
      if (res.success) toast.success(res.message, { id: toastId });
      else toast.error(res.message, { id: toastId });
      router.refresh();
    } catch {
      toast.error("Generation failed", { id: toastId });
    } finally {
      setBusy(null);
    }
  }

  const { counts } = view;

  return (
    <div className="space-y-6">
      {/* Locations + campaign */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4" /> Target locations
          </CardTitle>
          <CardDescription>
            One location per line (city, region, or &ldquo;city, province&rdquo;). The matrix
            crosses each blog&apos;s locked peptide compounds with these
            locations — each pair becomes one long-tail page, generated as a full
            unique article and dripped out at your daily cap (not dumped at once).
            Each page hyperlinks its buy-phrases to the site&apos;s own money
            domain (the funnel).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={5}
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder={"Toronto, Ontario\nVancouver, BC\nMontreal, Quebec\nMississauga, Ontario"}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={saveLocations} disabled={busy === "save"}>
              {busy === "save" ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <Save className="size-4" data-icon="inline-start" />
              )}
              Save locations
            </Button>
            <Button onClick={build} disabled={busy === "build"}>
              {busy === "build" ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <Hammer className="size-4" data-icon="inline-start" />
              )}
              Build / update matrix
            </Button>
            <span className="text-xs text-muted-foreground">
              Save locations first, then build. Building is safe to re-run — it
              only adds new combinations.
            </span>
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">
              Dosages{" "}
              <span className="font-normal text-muted-foreground">
                (optional, one per line)
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Leave empty for plain compound × location pages. Add dosages (e.g.
              5mg, 10mg) to ALSO build a page per dosage — the matrix keeps the
              no-dosage page and adds one for each dosage.
            </p>
            <Textarea
              rows={3}
              value={dosages}
              onChange={(e) => setDosages(e.target.value)}
              placeholder={"5mg\n10mg"}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={saveDosages} disabled={busy === "dosages"}>
              {busy === "dosages" ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <Save className="size-4" data-icon="inline-start" />
              )}
              Save dosages
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-6 border-t pt-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={enabled}
                disabled={pending}
                onCheckedChange={(v) => {
                  setEnabled(v);
                  saveCampaign({ enabled: v });
                }}
              />
              Drip campaign {enabled ? "on" : "off"}
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span>Pages per blog / day</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={perDay}
                onChange={(e) => setPerDay(e.target.value)}
                onBlur={() => {
                  const n = Number(perDay);
                  if (Number.isFinite(n)) saveCampaign({ perDay: n });
                }}
                className="h-8 w-20"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Progress</CardTitle>
              <CardDescription>
                {counts.total} page{counts.total === 1 ? "" : "s"} in the matrix.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {counts.pending > 0 && (
                <Button size="sm" onClick={generateNow} disabled={busy === "now"}>
                  {busy === "now" ? (
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  ) : (
                    <Play className="size-4" data-icon="inline-start" />
                  )}
                  Generate now
                </Button>
              )}
              {counts.failed > 0 && (
                <Button variant="outline" size="sm" onClick={retry} disabled={busy === "retry"}>
                  {busy === "retry" ? (
                    <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                  ) : (
                    <RefreshCw className="size-4" data-icon="inline-start" />
                  )}
                  Retry {counts.failed} failed
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Pending" value={counts.pending} />
            <Stat label="Generated" value={counts.generated} />
            <Stat label="Failed" value={counts.failed} tone={counts.failed ? "bad" : undefined} />
          </div>
        </CardContent>
      </Card>

      {/* Recent targets */}
      {view.recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent targets</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Compound</TableHead>
                  <TableHead>Dosage</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.recent.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[360px] truncate font-medium" title={t.title}>
                      {t.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.compound}</TableCell>
                    <TableCell className="text-muted-foreground">{t.dosage || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.location}</TableCell>
                    <TableCell>
                      <Badge
                        variant={statusVariant[t.status] ?? "secondary"}
                        className="font-normal"
                      >
                        {t.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bad";
}) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-2xl font-semibold ${tone === "bad" ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}
