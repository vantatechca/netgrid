"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { triggerClientPosts } from "@/lib/actions/blog-actions";

export interface TriggerClientPostsBlog {
  id: string;
  domain: string;
  status: string | null;
}

// Decommissioned sites can't receive posts — keep them out of the picker.
// Everything else is selectable; active sites are pre-checked, the rest
// (paused / setup) are listed unchecked so the operator opts in deliberately.
function isSelectableByDefault(status: string | null): boolean {
  return status === "active";
}

const statusBadgeVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  paused: "outline",
  setup: "secondary",
};

export function TriggerClientPostsButton({
  clientId,
  blogs,
}: {
  clientId: string;
  blogs: TriggerClientPostsBlog[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [autoPublish, setAutoPublish] = useState(true);

  const selectableBlogs = useMemo(
    () => blogs.filter((b) => b.status !== "decommissioned"),
    [blogs],
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // Seed the selection whenever the dialog opens so it reflects the current
  // blog list (active pre-checked) and resets any prior in-dialog changes.
  const openChange = (next: boolean) => {
    if (next) {
      const seed: Record<string, boolean> = {};
      for (const b of selectableBlogs) {
        seed[b.id] = isSelectableByDefault(b.status);
      }
      setSelected(seed);
    }
    setOpen(next);
  };

  const selectedIds = useMemo(
    () => selectableBlogs.filter((b) => selected[b.id]).map((b) => b.id),
    [selectableBlogs, selected],
  );

  const allChecked =
    selectableBlogs.length > 0 && selectedIds.length === selectableBlogs.length;

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    for (const b of selectableBlogs) next[b.id] = !allChecked;
    setSelected(next);
  };

  const handleTrigger = () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one site.");
      return;
    }
    start(async () => {
      const t = toast.loading(
        autoPublish
          ? `Generating and publishing to ${selectedIds.length} site${selectedIds.length === 1 ? "" : "s"}…`
          : `Generating drafts for ${selectedIds.length} site${selectedIds.length === 1 ? "" : "s"}…`,
        { description: "This can take a while — one post per site." },
      );

      const res = await triggerClientPosts({
        clientId,
        blogIds: selectedIds,
        autoPublish,
      });

      if (res.success) {
        toast.success("Done", { id: t, description: res.message });
      } else if (res.generatedCount > 0 || res.publishedCount > 0) {
        toast.warning("Finished with some failures", {
          id: t,
          description: res.message,
        });
      } else {
        toast.error("Trigger failed", { id: t, description: res.message });
      }

      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button>
          <Rocket className="size-4" />
          Trigger posts
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trigger posts</DialogTitle>
          <DialogDescription>
            Generate one fresh post for each selected site. Topics are picked
            automatically from the client&apos;s prompt/niche and recent posts.
          </DialogDescription>
        </DialogHeader>

        {selectableBlogs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This client has no active sites to post to.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                Sites ({selectedIds.length}/{selectableBlogs.length})
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={toggleAll}
                disabled={pending}
              >
                {allChecked ? "Deselect all" : "Select all"}
              </Button>
            </div>

            <ScrollArea className="max-h-56 rounded-md border">
              <div className="divide-y">
                {selectableBlogs.map((b) => (
                  <label
                    key={b.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selected[b.id] ?? false}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({ ...prev, [b.id]: v === true }))
                      }
                      disabled={pending}
                    />
                    <span className="flex-1 truncate text-sm">{b.domain}</span>
                    {b.status && (
                      <Badge
                        variant={statusBadgeVariant[b.status] ?? "secondary"}
                        className="text-[10px]"
                      >
                        {b.status}
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="trigger-auto-publish" className="text-sm">
                  Publish immediately
                </Label>
                <p className="text-xs text-muted-foreground">
                  Push each post live right after generation. Off = draft only.
                </p>
              </div>
              <Switch
                id="trigger-auto-publish"
                checked={autoPublish}
                onCheckedChange={setAutoPublish}
                disabled={pending}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleTrigger}
            disabled={pending || selectedIds.length === 0}
          >
            {pending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
            {autoPublish
              ? `Generate & publish (${selectedIds.length})`
              : `Generate drafts (${selectedIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
