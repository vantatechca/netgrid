"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteBlogLivePost,
  editBlogLivePost,
  publishGeneratedPost,
  retryGeneratedPost,
  type BlogGeneratedPostRow,
  type BlogLivePostRow,
} from "@/lib/actions/blog-actions";
import { GeneratePostButton } from "./generate-post-button";

// ─── Helpers ────────────────────────────────────────────────────────────────

const GENERATED_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  generating: "secondary",
  generated: "secondary",
  publishing: "secondary",
  published: "default",
  failed: "destructive",
};

const LIVE_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  publish: "default",
  draft: "outline",
  pending: "secondary",
  private: "secondary",
  future: "secondary",
  trash: "destructive",
};

function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Per-row actions for the Generated tab ──────────────────────────────────

function GeneratedRowActions({ row }: { row: BlogGeneratedPostRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const isPublished = row.status === "published";
  const isFailed = row.status === "failed";
  const isInFlight =
    row.status === "publishing" || row.status === "generating";
  const canPublish = row.status === "generated" || row.status === "pending";

  const handlePublish = () => {
    start(async () => {
      const t = toast.loading(isFailed ? "Retrying…" : "Publishing…");
      const res = isFailed
        ? await retryGeneratedPost(row.id)
        : await publishGeneratedPost(row.id);

      if (res.success) toast.success(res.message, { id: t });
      else toast.error(res.message, { id: t });

      router.refresh();
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {(canPublish || isFailed) && (
        <Button
          size="sm"
          variant={isFailed ? "outline" : "default"}
          onClick={handlePublish}
          disabled={pending}
          title={isFailed ? "Retry publish" : "Publish to live"}
        >
          {pending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Send className="mr-1.5 size-3.5" />
          )}
          {isFailed ? "Retry" : "Publish"}
        </Button>
      )}

      {isInFlight && !pending && (
        <Button size="sm" variant="outline" disabled>
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          {row.status === "generating" ? "Generating…" : "Publishing…"}
        </Button>
      )}

      {isPublished && row.externalPostUrl && (
        <a
          href={row.externalPostUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex"
        >
          <Button variant="ghost" size="icon" title="View live post">
            <ExternalLink className="size-4" />
          </Button>
        </a>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  blogId: string;
  generated: BlogGeneratedPostRow[];
  live: {
    available: boolean;
    platform: string;
    posts: BlogLivePostRow[];
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    error?: string;
  };
}

export function BlogPostsPanel({ blogId, generated, live }: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  // Edit dialog state
  const [editing, setEditing] = useState<BlogLivePostRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStatus, setEditStatus] = useState<
    "publish" | "draft" | "pending" | "private"
  >("publish");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation state
  const [deleting, setDeleting] = useState<BlogLivePostRow | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [deletingPending, setDeletingPending] = useState(false);

  function openEdit(post: BlogLivePostRow) {
    setEditing(post);
    setEditTitle(post.title);
    setEditContent("");
    setEditStatus(
      (["publish", "draft", "pending", "private"] as const).includes(
        post.status as "publish" | "draft" | "pending" | "private",
      )
        ? (post.status as "publish" | "draft" | "pending" | "private")
        : "publish",
    );
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    const payload: Parameters<typeof editBlogLivePost>[2] = {
      status: editStatus,
    };
    if (editTitle.trim() && editTitle !== editing.title)
      payload.title = editTitle.trim();
    if (editContent.trim()) payload.content = editContent;

    const result = await editBlogLivePost(blogId, editing.id, payload);
    setSavingEdit(false);
    if (result.success) {
      toast.success(result.message);
      setEditing(null);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletingPending(true);
    const result = await deleteBlogLivePost(blogId, deleting.id, forceDelete);
    setDeletingPending(false);
    if (result.success) {
      toast.success(result.message);
      setDeleting(null);
      setForceDelete(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  function handleRefresh() {
    startRefresh(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Posts
            </CardTitle>
            <CardDescription>
              Auto-generated posts from this app + live posts from the
              destination site.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <GeneratePostButton blogId={blogId} />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="generated">
          <TabsList>
            <TabsTrigger value="generated">
              Generated ({generated.length})
            </TabsTrigger>
            <TabsTrigger value="live">
              Live on{" "}
              {live.platform === "wordpress" ? "WordPress" : live.platform} (
              {live.total})
            </TabsTrigger>
          </TabsList>

          {/* Generated tab */}
          <TabsContent value="generated" className="pt-4">
            {generated.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No generated posts yet. Click <strong>Generate post</strong>{" "}
                above to create one.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic / Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Words</TableHead>
                    <TableHead>SEO</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Auto?</TableHead>
                    <TableHead className="w-[180px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {generated.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-md">
                        <div className="space-y-1">
                          <p className="line-clamp-1 text-sm font-medium">
                            {row.title || row.topic}
                          </p>
                          {row.title && row.title !== row.topic && (
                            <p className="line-clamp-1 text-xs text-muted-foreground">
                              {row.topic}
                            </p>
                          )}
                          {row.failureReason && (
                            <p className="line-clamp-2 text-xs text-destructive">
                              {row.failureReason}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            GENERATED_STATUS_VARIANTS[row.status] ?? "outline"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.wordCount ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.seoScore ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(row.publishedAt)}
                      </TableCell>
                      <TableCell>
                        {row.isAutoGenerated ? (
                          <Badge variant="outline" className="text-xs">
                            cron
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            manual
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <GeneratedRowActions row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Live tab */}
          <TabsContent value="live" className="pt-4">
            {!live.available ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {live.error ?? "Live posts unavailable."}
                </p>
              </div>
            ) : live.posts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No posts found on the live site.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>Modified</TableHead>
                      <TableHead className="w-[140px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {live.posts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="max-w-md">
                          <div className="space-y-1">
                            <p className="line-clamp-1 text-sm font-medium">
                              {post.title}
                            </p>
                            {post.excerpt && (
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {post.excerpt}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              LIVE_STATUS_VARIANTS[post.status] ?? "outline"
                            }
                          >
                            {post.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(post.date)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(post.modified)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <a
                              href={post.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex"
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Open"
                              >
                                <ExternalLink className="size-4" />
                              </Button>
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(post)}
                              title="Edit"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleting(post)}
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {live.totalPages > 1 && (
                  <p className="pt-3 text-xs text-muted-foreground">
                    Page {live.page} of {live.totalPages} · {live.total} total
                    posts on the live site
                  </p>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Edit dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit post</DialogTitle>
            <DialogDescription>
              Changes are pushed to the live site immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-content">
                Content (HTML){" "}
                <span className="font-normal text-muted-foreground">
                  — leave blank to keep the existing content
                </span>
              </Label>
              <Textarea
                id="edit-content"
                rows={10}
                placeholder="Paste new HTML content here, or leave blank to only update title/status."
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editStatus}
                onValueChange={(v) =>
                  setEditStatus(v as "publish" | "draft" | "pending" | "private")
                }
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publish">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setForceDelete(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.title ? (
                <span>
                  &ldquo;{deleting.title}&rdquo; will be{" "}
                  {forceDelete
                    ? "permanently deleted"
                    : "moved to the WordPress trash"}
                  .
                </span>
              ) : (
                "This will be removed from the live site."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
            <input
              id="force-delete"
              type="checkbox"
              checked={forceDelete}
              onChange={(e) => setForceDelete(e.target.checked)}
              className="size-4"
            />
            <label htmlFor="force-delete" className="text-sm">
              Skip the trash and delete permanently
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletingPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {forceDelete ? "Delete permanently" : "Move to trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
