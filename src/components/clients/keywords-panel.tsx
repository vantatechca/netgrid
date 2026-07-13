"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  scrapeClientKeywords,
  setClientKeywordActive,
  deleteClientKeyword,
  updateClientKeywordSeeds,
  type ClientKeyword,
} from "@/lib/actions/keyword-actions";

export function KeywordsPanel({
  clientId,
  keywords,
  initialSeeds,
}: {
  clientId: string;
  keywords: ClientKeyword[];
  initialSeeds: string;
}) {
  const router = useRouter();
  const [seeds, setSeeds] = useState(initialSeeds);
  const [savingSeeds, setSavingSeeds] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [pending, start] = useTransition();

  const activeCount = keywords.filter((k) => k.isActive).length;

  async function saveSeeds() {
    setSavingSeeds(true);
    const res = await updateClientKeywordSeeds(clientId, seeds);
    setSavingSeeds(false);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    router.refresh();
  }

  async function scrape() {
    setScraping(true);
    const toastId = toast.loading("Scraping keywords…", {
      description: "Expanding your seeds via Google Autocomplete.",
    });
    try {
      const res = await scrapeClientKeywords(clientId);
      if (res.success) toast.success(res.message, { id: toastId });
      else toast.error(res.message, { id: toastId });
      router.refresh();
    } catch {
      toast.error("Scrape failed", { id: toastId });
    } finally {
      setScraping(false);
    }
  }

  function toggle(id: string, isActive: boolean) {
    start(async () => {
      try {
        await setClientKeywordActive(id, isActive);
        router.refresh();
      } catch {
        toast.error("Could not update keyword");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      try {
        await deleteClientKeyword(id);
        router.refresh();
      } catch {
        toast.error("Could not delete keyword");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Seeds + scrape */}
      <Card>
        <CardHeader>
          <CardTitle>Keyword seeds</CardTitle>
          <CardDescription>
            Starting terms for the scraper — one per line (or comma-separated).
            These are combined with the client&apos;s niche key-topics, expanded
            via Google Autocomplete, and stored below. Active keywords are fed
            into every generated post (top 40 by rank).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            value={seeds}
            onChange={(e) => setSeeds(e.target.value)}
            placeholder={"bpc-157\npeptides\nmuscle recovery"}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={saveSeeds} disabled={savingSeeds}>
              {savingSeeds ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <Save className="size-4" data-icon="inline-start" />
              )}
              Save seeds
            </Button>
            <Button onClick={scrape} disabled={scraping}>
              {scraping ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <RefreshCw className="size-4" data-icon="inline-start" />
              )}
              Scrape keywords
            </Button>
            <span className="text-xs text-muted-foreground">
              Save your seeds first, then scrape. Re-scraping refreshes and adds
              new terms without losing your active/off choices.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Keyword list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Keywords
            <Badge variant="secondary" className="font-normal">
              {activeCount} active / {keywords.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Toggle a keyword off to exclude it from generation. Ranked by search
            volume when available, otherwise by autocomplete popularity.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {keywords.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No keywords yet. Add seeds above and click{" "}
              <strong>Scrape keywords</strong>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Signal</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[90px] text-center">Active</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((k) => (
                  <TableRow key={k.id} className={k.isActive ? "" : "opacity-50"}>
                    <TableCell className="font-medium">{k.keyword}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {k.searchVolume != null ? k.searchVolume.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {k.hitCount}
                      {k.bestPosition != null ? ` · #${k.bestPosition + 1}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-[10px]">
                        {k.source.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={k.isActive}
                        disabled={pending}
                        onCheckedChange={(v) => toggle(k.id, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${k.keyword}`}
                        onClick={() => remove(k.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
