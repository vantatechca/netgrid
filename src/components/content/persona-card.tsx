"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  generatePersonaForBlog,
  clearBlogPersona,
} from "@/lib/actions/style-profile-actions";
import type { GeneratedPersona } from "@/lib/content/types";

interface Props {
  blogId: string;
  initialPersona: GeneratedPersona | null;
  initialSeed: string | null;
}

/**
 * Generate a unique LLM writing persona for this blog (overrides the shared
 * library voice). Optional operator seed direction; each generated persona is
 * kept distinct from others in the same niche.
 */
export function PersonaCard({ blogId, initialPersona, initialSeed }: Props) {
  const router = useRouter();
  const [seed, setSeed] = useState(initialSeed ?? "");
  const [busy, setBusy] = useState<null | "gen" | "clear">(null);
  const persona = initialPersona;

  async function generate() {
    setBusy("gen");
    const t = toast.loading(
      persona ? "Regenerating persona…" : "Generating persona…",
      { description: "Inventing a distinct writing voice for this blog." },
    );
    const res = await generatePersonaForBlog(blogId, seed);
    setBusy(null);
    if (res.success) {
      toast.success(res.message, { id: t });
      router.refresh();
    } else {
      toast.error(res.message, { id: t });
    }
  }

  async function clear() {
    setBusy("clear");
    const res = await clearBlogPersona(blogId);
    setBusy(null);
    if (res.success) {
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="size-4" />
          Generated persona
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            optional
          </span>
        </CardTitle>
        <CardDescription>
          Give this blog a unique, LLM-generated writing voice instead of the
          shared library voice. Kept distinct from other blogs in the same niche.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {persona ? (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-green-600 hover:bg-green-600">
                {persona.label ?? "Custom voice"}
              </Badge>
              <span className="text-xs text-green-600">
                active — overrides the library voice
              </span>
            </div>
            <p>
              <span className="font-medium">Persona:</span> {persona.persona}
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Register:</span>{" "}
              {persona.registerSignature}
            </p>
            {persona.examplePara1 && (
              <p className="border-l-2 pl-3 text-xs italic text-muted-foreground">
                {persona.examplePara1}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No generated persona — this blog uses its assigned library voice.
          </p>
        )}

        <div className="space-y-1">
          <Textarea
            rows={2}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Optional direction, e.g. 'a 15-year pitmaster, dry humor, hates gimmicks'"
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank for a fully automatic voice.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {persona && (
            <Button variant="ghost" onClick={clear} disabled={busy !== null}>
              {busy === "clear" ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <RotateCcw className="size-4" data-icon="inline-start" />
              )}
              Use library voice
            </Button>
          )}
          <Button onClick={generate} disabled={busy !== null}>
            {busy === "gen" ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <Sparkles className="size-4" data-icon="inline-start" />
            )}
            {persona ? "Regenerate" : "Generate persona"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
