"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Wand2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updateClientCustomPrompt } from "@/lib/actions/client-actions";

interface Props {
  /** Client id — custom prompts are client-wide. */
  id: string;
  initial: string | null | undefined;
  initialStackPersona?: boolean | null;
}

/**
 * Set a client-wide custom generation prompt. When set, ALL of this client's
 * blogs are generated from this prompt instead of the niche/persona style —
 * compliance disclaimers and the JSON output contract stay locked automatically.
 * The "keep persona" toggle optionally layers each blog's own generated voice on
 * top of the prompt (persona is per-blog, so each site keeps its own voice).
 */
export function CustomPromptCard({ id, initial, initialStackPersona }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [stackPersona, setStackPersona] = useState(!!initialStackPersona);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await updateClientCustomPrompt(id, value, stackPersona);
    setSaving(false);
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
          Custom generation prompt
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            optional
          </span>
        </CardTitle>
        <CardDescription>
          Client-wide prompt applied to <strong>all this client&apos;s blogs</strong>.
          When set, posts are generated from this prompt instead of the
          niche/persona style. Leave blank to use the niche/persona style.
          Compliance disclaimers and the required JSON output are always enforced
          on top of your prompt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            "e.g. Write as a 15-year commercial roofer talking to facility managers. Lead with a real cost range, then walk through the decision. Blunt, no fluff, cite manufacturer warranties by name..."
          }
          className="font-mono text-xs"
        />

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="pr-4">
            <Label htmlFor="stackPersona" className="text-sm">
              Keep each blog&apos;s persona on top of this prompt
            </Label>
            <p className="text-xs text-muted-foreground">
              When on, each blog&apos;s generated voice/persona is layered onto
              the custom prompt instead of being replaced by it. Persona is
              per-blog, so every site keeps its own voice. Only affects blogs
              that already have a generated persona.
            </p>
          </div>
          <Switch
            id="stackPersona"
            checked={stackPersona}
            onCheckedChange={setStackPersona}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {value.trim()
              ? "Active — posts will follow this prompt."
              : "Empty — using the niche/persona style."}
          </p>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
            ) : (
              <Save className="size-4" data-icon="inline-start" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
