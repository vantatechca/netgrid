"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { generateBlogPost } from "@/lib/actions/blog-actions";

export function GeneratePostButton({ blogId }: { blogId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [autoPublish, setAutoPublish] = useState(true);

  const handleGenerate = () => {
    start(async () => {
      const t = toast.loading(
        autoPublish ? "Generating and publishing…" : "Generating post…",
        { description: "This usually takes 15-30 seconds." },
      );

      const res = await generateBlogPost({
        blogId,
        topic: topic.trim() || undefined,
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        autoPublish,
      });

      if (!res.success) {
        toast.error(res.message, { id: t });
        return;
      }

      if (autoPublish && res.publishResult) {
        if (res.publishResult.success) {
          toast.success("Generated and published!", {
            id: t,
            description: res.publishResult.message,
          });
        } else {
          toast.error("Generated, but publish failed", {
            id: t,
            description: res.publishResult.message,
          });
        }
      } else {
        toast.success("Post generated", {
          id: t,
          description: "Click Publish on the row when ready.",
        });
      }

      setOpen(false);
      setTopic("");
      setKeywords("");
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Wand2 className="mr-1.5 size-3.5" />
          Generate post
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a new post</DialogTitle>
          <DialogDescription>
            Leave the topic blank to let Claude pick one based on the niche
            and recent posts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic (optional)</Label>
            <Input
              id="topic"
              placeholder="e.g. BPC-157 dosage research overview"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="keywords">
              Keywords (comma-separated, optional)
            </Label>
            <Input
              id="keywords"
              placeholder="BPC-157, peptide research, healing"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="auto-publish" className="text-sm">
                Publish immediately
              </Label>
              <p className="text-xs text-muted-foreground">
                Push live to the destination right after generation.
              </p>
            </div>
            <Switch
              id="auto-publish"
              checked={autoPublish}
              onCheckedChange={setAutoPublish}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={pending}>
            {pending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
            {autoPublish ? "Generate & publish" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}