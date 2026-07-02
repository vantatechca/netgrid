"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  syncNichesFromCode,
  updateNiche,
  type NicheRow,
} from "@/lib/actions/niche-actions";

/** "Sync from code" — seeds any missing niche rows from the hardcoded config. */
export function SyncNichesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function sync() {
    start(async () => {
      const toastId = toast.loading("Syncing niches from code…");
      try {
        const res = await syncNichesFromCode();
        toast.success(res.message, { id: toastId });
        router.refresh();
      } catch {
        toast.error("Sync failed", { id: toastId });
      }
    });
  }

  return (
    <Button variant="outline" onClick={sync} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
      ) : (
        <RefreshCw className="size-4" data-icon="inline-start" />
      )}
      Sync from code
    </Button>
  );
}

export function NicheEditor({ niche }: { niche: NicheRow }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [label, setLabel] = useState(niche.label);
  const [industry, setIndustry] = useState(niche.industry);
  const [audience, setAudience] = useState(niche.defaultAudience ?? "");
  const [brandVoice, setBrandVoice] = useState(niche.defaultBrandVoice ?? "");
  const [contentStyle, setContentStyle] = useState(niche.contentStyle ?? "");
  const [keyTopics, setKeyTopics] = useState(
    Array.isArray(niche.keyTopics) ? (niche.keyTopics as string[]).join(", ") : "",
  );
  const [requirements, setRequirements] = useState(niche.requirements ?? "");
  const [disclaimers, setDisclaimers] = useState(
    Array.isArray(niche.disclaimers)
      ? (niche.disclaimers as string[]).join("\n")
      : "",
  );
  const [wordBandMin, setWordBandMin] = useState(
    niche.wordBandMin != null ? String(niche.wordBandMin) : "",
  );
  const [wordBandMax, setWordBandMax] = useState(
    niche.wordBandMax != null ? String(niche.wordBandMax) : "",
  );

  async function save() {
    setSaving(true);
    const res = await updateNiche(niche.id, {
      label: label.trim(),
      industry: industry.trim(),
      defaultAudience: audience.trim() || null,
      defaultBrandVoice: brandVoice.trim() || null,
      contentStyle: contentStyle.trim() || null,
      keyTopics: keyTopics
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      requirements: requirements.trim() || null,
      disclaimers: disclaimers
        .split("\n")
        .map((d) => d.trim())
        .filter(Boolean),
      wordBandMin: wordBandMin ? Number(wordBandMin) : null,
      wordBandMax: wordBandMax ? Number(wordBandMax) : null,
    });
    setSaving(false);
    if (res.success) {
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="label">Label</Label>
          <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="audience">Default audience</Label>
        <Textarea
          id="audience"
          rows={2}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="voice">Default brand voice</Label>
        <Textarea
          id="voice"
          rows={2}
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="style">
          Content style{" "}
          <span className="font-normal text-muted-foreground">
            — the voice/approach directive injected into the prompt
          </span>
        </Label>
        <Textarea
          id="style"
          rows={5}
          value={contentStyle}
          onChange={(e) => setContentStyle(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="topics">
          Key topics{" "}
          <span className="font-normal text-muted-foreground">(comma-separated)</span>
        </Label>
        <Textarea
          id="topics"
          rows={3}
          value={keyTopics}
          onChange={(e) => setKeyTopics(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="requirements">
          Niche-specific requirements{" "}
          <span className="font-normal text-muted-foreground">
            — the &quot;how to write for this niche&quot; rules block
          </span>
        </Label>
        <Textarea
          id="requirements"
          rows={6}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="disclaimers">
          Compliance / legal disclaimers{" "}
          <span className="font-normal text-muted-foreground">(one per line)</span>
        </Label>
        <Textarea
          id="disclaimers"
          rows={3}
          value={disclaimers}
          onChange={(e) => setDisclaimers(e.target.value)}
          placeholder="e.g. This is general information, not legal advice."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wbmin">Word band min (optional)</Label>
          <Input
            id="wbmin"
            type="number"
            value={wordBandMin}
            onChange={(e) => setWordBandMin(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wbmax">Word band max (optional)</Label>
          <Input
            id="wbmax"
            type="number"
            value={wordBandMax}
            onChange={(e) => setWordBandMax(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <Save className="size-4" data-icon="inline-start" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}
