"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateModelSettings } from "@/lib/actions/settings-actions";

interface Option {
  value: string;
  label: string;
}

interface Props {
  contentModel: string;
  fixModel: string;
  deepseekConfigured: boolean;
  anthropicConfigured: boolean;
  contentOptions: Option[];
  fixOptions: Option[];
}

export function AiModelsCard({
  contentModel: initialContent,
  fixModel: initialFix,
  deepseekConfigured,
  anthropicConfigured,
  contentOptions,
  fixOptions,
}: Props) {
  const router = useRouter();
  const [contentModel, setContentModel] = useState(initialContent);
  const [fixModel, setFixModel] = useState(initialFix);
  const [pending, start] = useTransition();

  const dirty = contentModel !== initialContent || fixModel !== initialFix;
  // Warn when the chosen provider has no API key configured on the server.
  const contentWarning =
    contentModel === "deepseek" && !deepseekConfigured
      ? "DEEPSEEK_API_KEY isn't configured — generation will fail until it's set."
      : (contentModel === "claude" || contentModel === "auto") &&
          !anthropicConfigured
        ? "ANTHROPIC_API_KEY isn't configured — Claude calls will fail."
        : null;
  const fixWarning = !anthropicConfigured
    ? "ANTHROPIC_API_KEY isn't configured — fixes/reports will fail."
    : null;

  function save() {
    start(async () => {
      const res = await updateModelSettings({
        contentModel: contentModel as "auto" | "deepseek" | "claude",
        fixModel,
      });
      if (res.success) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Models</CardTitle>
        <CardDescription>
          Choose which model powers content generation and SEO fixes. Changes
          take effect within a few seconds — no redeploy needed.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant={deepseekConfigured ? "default" : "outline"}>
            DeepSeek {deepseekConfigured ? "configured" : "not configured"}
          </Badge>
          <Badge variant={anthropicConfigured ? "default" : "outline"}>
            Anthropic {anthropicConfigured ? "configured" : "not configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="content-model">Content generation</Label>
          <Select value={contentModel} onValueChange={setContentModel}>
            <SelectTrigger id="content-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contentOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Drives article/topic generation. &ldquo;Auto&rdquo; tries DeepSeek
            first and falls back to Claude; the exclusive modes never call the
            other provider.
          </p>
          {contentWarning && (
            <p className="text-xs text-destructive">{contentWarning}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="fix-model">SEO fixes &amp; reports</Label>
          <Select value={fixModel} onValueChange={setFixModel}>
            <SelectTrigger id="fix-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fixOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Claude model used for SEO fixes, issue descriptions, and monthly
            reports.
          </p>
          {fixWarning && (
            <p className="text-xs text-destructive">{fixWarning}</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={pending || !dirty} size="sm">
            {pending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
