"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileSearch,
  Loader2,
  RefreshCw,
  Save,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  importNicheFromFile,
  previewNichePrompt,
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

/**
 * Import a niche from an uploaded reference file (brief / style guide /
 * compliance sheet). Converts + AI-drafts the config, then jumps to the new
 * niche's editor for review. Automates the "read the file, hand-code it" step.
 */
export function ImportNicheButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    start(async () => {
      const toastId = toast.loading(`Importing ${file.name}…`, {
        description: "Reading the file and drafting the niche config.",
      });
      const fd = new FormData();
      fd.append("file", file);
      const res = await importNicheFromFile(fd);
      if (res.success && res.nicheId) {
        toast.success(res.message, { id: toastId });
        router.push(`/content-studio/niches/${res.nicheId}`);
      } else {
        toast.error(res.message, { id: toastId });
      }
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.csv,.txt,.md,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
        onChange={onFile}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <Upload className="size-4" data-icon="inline-start" />
        )}
        Import from file
      </Button>
    </>
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

type PreviewResult = Awaited<ReturnType<typeof previewNichePrompt>>;

/**
 * Parity check: renders the article system prompt for this niche both from the
 * live code config and from this DB row, and flags whether they're identical.
 * Green = switching generation to the DB is a no-op; amber = the diff shows how
 * generated posts would change. Save first, then re-run to see edits reflected.
 */
export function NichePromptPreview({ nicheId }: { nicheId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PreviewResult | null>(null);

  function run() {
    start(async () => setResult(await previewNichePrompt(nicheId)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={run} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          ) : (
            <FileSearch className="size-4" data-icon="inline-start" />
          )}
          Preview prompt (parity check)
        </Button>
        {result?.success &&
          (result.identical ? (
            <Badge className="gap-1 bg-green-600 hover:bg-green-600">
              <CheckCircle2 className="size-3.5" /> Identical to code
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <TriangleAlert className="size-3.5" /> Differs from code
            </Badge>
          ))}
      </div>

      {result && !result.success && (
        <p className="text-sm text-destructive">{result.message}</p>
      )}

      {result?.success && (
        <>
          <p className="text-xs text-muted-foreground">
            Sample prompt for niche <code>{result.nicheKey}</code> (fixed sample
            topic/seed so only the niche config differs).
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                From code (live today)
              </p>
              <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                {result.fromCode}
              </pre>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                From this DB row
              </p>
              <pre
                className={`max-h-96 overflow-auto rounded-md border p-3 text-[11px] leading-relaxed whitespace-pre-wrap ${
                  result.identical
                    ? "bg-muted/30"
                    : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                }`}
              >
                {result.fromDb}
              </pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
