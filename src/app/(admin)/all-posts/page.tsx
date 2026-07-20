import { db } from "@/lib/db";
import { blogs, clients, generatedPosts } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { AllPostsClientFilter } from "@/components/posts/all-posts-client-filter";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ─── Status model ────────────────────────────────────────────────────────────
// generated_posts.status enum: pending | generating | generated | publishing |
// published | failed. We surface them through a few coarse lenses so an admin
// can answer "what's live?" (active) and "what broke?" (failed) at a glance.

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

type PostStatus =
  | "pending"
  | "generating"
  | "generated"
  | "publishing"
  | "published"
  | "failed";

type FilterKey = "all" | "active" | "failed" | "ready" | "working";

// Statuses grouped under each filter tab. "active" = live on the destination
// site; "working" = anything still moving through the pipeline; "ready" =
// generated but not yet published.
const FILTERS: Record<FilterKey, { label: string; statuses: PostStatus[] | null }> = {
  all: { label: "All", statuses: null },
  active: { label: "Active", statuses: ["published"] },
  failed: { label: "Failed", statuses: ["failed"] },
  ready: { label: "Ready to publish", statuses: ["generated"] },
  working: { label: "In progress", statuses: ["pending", "generating", "publishing"] },
};

function isFilterKey(v: string | undefined): v is FilterKey {
  return v !== undefined && v in FILTERS;
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface AllPostsPageProps {
  searchParams: { status?: string; client?: string };
}

export default async function AllPostsPage({ searchParams }: AllPostsPageProps) {
  await requireAdmin();

  const activeFilter: FilterKey = isFilterKey(searchParams.status)
    ? searchParams.status
    : "all";

  // Clients that actually have generated posts — populates the client filter
  // dropdown. Distinct so each client appears once.
  const clientOptions = await db
    .selectDistinct({ id: clients.id, name: clients.name })
    .from(generatedPosts)
    .innerJoin(clients, eq(generatedPosts.clientId, clients.id))
    .orderBy(clients.name);

  // Only honour a client id we actually know about; anything else falls back
  // to "all clients" so a stale/bogus param can't silently empty the page.
  const selectedClient =
    searchParams.client && clientOptions.some((c) => c.id === searchParams.client)
      ? searchParams.client
      : "";
  const clientWhere = selectedClient
    ? eq(generatedPosts.clientId, selectedClient)
    : undefined;

  // Status counts (optionally scoped to the selected client) — drives the stat
  // cards and the filter tab badges. One grouped query rather than counting a
  // fetched list, so the numbers stay correct regardless of the row limit below.
  const statusRows = await db
    .select({
      status: generatedPosts.status,
      count: sql<number>`count(*)::int`,
    })
    .from(generatedPosts)
    .where(clientWhere)
    .groupBy(generatedPosts.status);

  const countByStatus: Record<string, number> = {};
  for (const r of statusRows) countByStatus[r.status] = r.count;

  const countFor = (statuses: PostStatus[] | null): number => {
    if (!statuses) return statusRows.reduce((sum, r) => sum + r.count, 0);
    return statuses.reduce((sum, s) => sum + (countByStatus[s] ?? 0), 0);
  };

  const totalCount = countFor(null);
  const activeCount = countFor(FILTERS.active.statuses);
  const failedCount = countFor(FILTERS.failed.statuses);
  const workingCount = countFor(FILTERS.working.statuses) + countFor(FILTERS.ready.statuses);

  // The list itself, filtered to the selected lens. Newest activity first.
  const filterStatuses = FILTERS[activeFilter].statuses;
  const rows = await db
    .select({
      id: generatedPosts.id,
      blogId: generatedPosts.blogId,
      domain: blogs.domain,
      clientName: clients.name,
      topic: generatedPosts.topic,
      title: generatedPosts.title,
      status: generatedPosts.status,
      wordCount: generatedPosts.wordCount,
      seoScore: generatedPosts.seoScore,
      failureReason: generatedPosts.failureReason,
      isAutoGenerated: generatedPosts.isAutoGenerated,
      externalPostUrl: generatedPosts.externalPostUrl,
      publishedAt: generatedPosts.publishedAt,
      updatedAt: generatedPosts.updatedAt,
    })
    .from(generatedPosts)
    .leftJoin(blogs, eq(generatedPosts.blogId, blogs.id))
    .leftJoin(clients, eq(generatedPosts.clientId, clients.id))
    .where(
      and(
        clientWhere,
        filterStatuses ? inArray(generatedPosts.status, filterStatuses) : undefined,
      ),
    )
    .orderBy(desc(generatedPosts.updatedAt))
    .limit(300);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Posts</h1>
        <p className="text-muted-foreground">
          Every generated post across all blogs. See what&apos;s live (active) and
          what failed to publish, in one place.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Active (Published)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", failedCount > 0 && "text-red-600")}>
              {failedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{workingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">generating, ready or publishing</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(FILTERS) as FilterKey[]).map((key) => {
          const f = FILTERS[key];
          const count = countFor(f.statuses);
          const isActive = key === activeFilter;
          // Preserve the selected client when switching status lens.
          const params = new URLSearchParams();
          if (key !== "all") params.set("status", key);
          if (selectedClient) params.set("client", selectedClient);
          const qs = params.toString();
          return (
            <Link
              key={key}
              href={qs ? `/all-posts?${qs}` : "/all-posts"}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {f.label}
              <span className="text-xs text-muted-foreground">{count}</span>
            </Link>
          );
        })}

        <div className="ml-auto">
          <AllPostsClientFilter
            clients={clientOptions}
            status={activeFilter}
            selected={selectedClient}
          />
        </div>
      </div>

      {/* Posts table */}
      <Card>
        <CardHeader>
          <CardTitle>{FILTERS[activeFilter].label} Posts</CardTitle>
          <CardDescription>
            {rows.length === 300
              ? "Showing the 300 most recently updated posts."
              : `Showing ${rows.length} post${rows.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No posts in this view.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic / Title</TableHead>
                  <TableHead>Blog</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Auto?</TableHead>
                  <TableHead className="text-right">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-md">
                      <div className="space-y-1">
                        <Link
                          href={`/blogs/${row.blogId}/posts`}
                          className="line-clamp-1 text-sm font-medium hover:underline"
                        >
                          {row.title || row.topic}
                        </Link>
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
                      <Link
                        href={`/blogs/${row.blogId}/posts`}
                        className="text-sm hover:underline"
                      >
                        {row.domain ?? "(unknown blog)"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.clientName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={GENERATED_STATUS_VARIANTS[row.status] ?? "outline"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.wordCount ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(row.updatedAt)}
                    </TableCell>
                    <TableCell>
                      {row.isAutoGenerated ? (
                        <Badge variant="outline" className="text-xs">
                          cron
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">manual</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.externalPostUrl ? (
                        <a
                          href={row.externalPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="size-3.5" />
                          Live
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
