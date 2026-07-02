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
import { updateBlogCustomPrompt } from "@/lib/actions/blog-actions";
import { updateClientCustomPrompt } from "@/lib/actions/client-actions";

interface Props {
  scope: "blog" | "client";
  id: string;
  initial: string | null | undefined;
}

/**
 * Set an optional custom generation prompt. Client scope = default for all the
 * client's blogs; blog scope = per-blog override. When set, generation follows
 * this prompt instead of the niche/persona style — compliance disclaimers and
 * the JSON output contract stay locked automatically.
 */
export function CustomPromptCard({ scope, id, initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  const isBlog = scope === "blog";

  async function save() {
    setSaving(true);
    const res = isBlog
      ? await updateBlogCustomPrompt(id, value)
      : await updateClientCustomPrompt(id, value);
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
          {isBlog ? (
            <>
              When set, this blog&apos;s posts are generated from this prompt
              instead of the niche/persona style. Overrides the client default.
            </>
          ) : (
            <>
              Default prompt for all this client&apos;s blogs. A per-blog custom
              prompt overrides it. Leave blank to use the niche/persona style.
            </>
          )}{" "}
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
