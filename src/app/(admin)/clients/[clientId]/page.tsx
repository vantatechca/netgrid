import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getClientStats } from "@/lib/actions/client-actions";
import { getBlogs } from "@/lib/actions/blog-actions";
import { getSeoScans, getSeoIssues } from "@/lib/actions/seo-actions";
import { getMessages } from "@/lib/actions/message-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlogTable } from "@/components/blogs/blog-table";
import { MessageThread } from "@/components/messages/message-thread";
import { ClientForm } from "@/components/clients/client-form";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  FileText,
  Globe,
  Lock,
  MessageSquare,
  Pencil,
  Wrench,
} from "lucide-react";

interface ClientDetailPageProps {
  params: { clientId: string };
  searchParams: { edit?: string };
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  onboarding: "secondary",
  paused: "outline",
  churned: "destructive",
};

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  warning: "secondary",
  notice: "outline",
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSeoScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: ClientDetailPageProps) {
  const { clientId } = params;
  const isEditMode = searchParams.edit === "true";

  // ─── EDIT MODE ────────────────────────────────────────────────────────────
  if (isEditMode) {
    const client = await getClient(clientId).catch(() => null);
    if (!client) notFound();

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/clients/${clientId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Edit {client.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Update client info and internal notes
            </p>
          </div>
        </div>

        <ClientForm
          mode="edit"
          defaultValues={{
            id: client.id,
            name: client.name,
            contactName: client.contactName ?? "",
            contactEmail: client.contactEmail ?? "",
            contactPhone: client.contactPhone ?? "",
            niche: client.niche ?? "",
            totalBlogsTarget: client.totalBlogsTarget ?? 0,
            notesInternal: client.notesInternal ?? "",
            status:
              (client.status as
                | "onboarding"
                | "active"
                | "paused"
                | "churned"
                | undefined) ?? "onboarding",
          }}
        />
      </div>
    );
  }

  // ─── DETAIL VIEW ──────────────────────────────────────────────────────────
  const [client, stats, blogsResult, scansResult, issuesResult, messages] =
    (await Promise.all([
      getClient(clientId),
      getClientStats(clientId),
      getBlogs({ clientId, pageSize: 50 }).catch(() => ({
        blogs: [],
        totalCount: 0,
        page: 1,
        pageSize: 50,
        totalPages: 0,
      })),
      getSeoScans(undefined, clientId, 1, 10).catch(() => ({
        scans: [],
        total: 0,
        page: 1,
        pageSize: 10,
      })),
      getSeoIssues({ clientId, status: "detected", pageSize: 20 }).catch(() => ({
        issues: [],
        total: 0,
        page: 1,
        pageSize: 20,
      })),
      getMessages({ clientId, pageSize: 200 }).catch(() => []),
    ]).catch(() => {
      notFound();
    })) as [
      Awaited<ReturnType<typeof getClient>>,
      Awaited<ReturnType<typeof getClientStats>>,
      Awaited<ReturnType<typeof getBlogs>>,
      Awaited<ReturnType<typeof getSeoScans>>,
      Awaited<ReturnType<typeof getSeoIssues>>,
      Awaited<ReturnType<typeof getMessages>>,
    ];

  if (!client) notFound();

  const blogDomainById = new Map(blogsResult.blogs.map((b) => [b.id, b.domain]));

  const internalChatNotes = messages
    .filter((m) => m.message.isInternal === true)
    .sort(
      (a, b) =>
        new Date(b.message.createdAt).getTime() -
        new Date(a.message.createdAt).getTime(),
    )
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/clients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
              <Badge
                variant={
                  client.status ? statusVariant[client.status] ?? "secondary" : "secondary"
                }
              >
                {client.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {client.niche ? `${client.niche} · ` : ""}
              Added {new Date(client.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Link href={`/clients/${client.id}?edit=true`}>
          <Button variant="outline">
            <Pencil className="size-4" />
            Edit Client
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Blogs</CardDescription>
            <CardTitle className="text-2xl">{stats.blogCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Avg SEO Score</CardDescription>
            <CardTitle className={`text-2xl ${getSeoScoreColor(stats.avgSeoScore ?? null)}`}>
              {stats.avgSeoScore !== null ? stats.avgSeoScore : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Posts This Month</CardDescription>
            <CardTitle className="text-2xl">{stats.postsThisMonth}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Messages</CardDescription>
            <CardTitle className="text-2xl">{stats.messageCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <Globe className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="blogs">
            <FileText className="size-4" />
            Blogs ({blogsResult.totalCount})
          </TabsTrigger>
          <TabsTrigger value="seo">
            <BarChart3 className="size-4" />
            SEO ({issuesResult.total})
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare className="size-4" />
            Messages ({messages.length})
            {internalChatNotes.length > 0 && (
              <span
                className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800"
                title={`${internalChatNotes.length} internal note${internalChatNotes.length === 1 ? "" : "s"}`}
              >
                <Lock className="size-2.5" />
                {internalChatNotes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 pt-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Company Name</p>
                    <p className="text-sm">{client.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Niche</p>
                    <p className="text-sm">{client.niche || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Contact Name</p>
                    <p className="text-sm">{client.contactName || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Contact Email</p>
                    <p className="text-sm">{client.contactEmail || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Contact Phone</p>
                    <p className="text-sm">{client.contactPhone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Blog Target</p>
                    <p className="text-sm">{client.totalBlogsTarget ?? 0} blogs</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Internal Notes — saved field + recent internal chat */}
            <Card className="lg:col-span-2 border-amber-200">
              <CardHeader className="bg-amber-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="size-4 text-amber-700" />
                    <CardTitle>Internal Notes</CardTitle>
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-[10px] text-amber-700"
                    >
                      Hidden from client
                    </Badge>
                  </div>
                  <Link href={`/clients/${client.id}?edit=true`}>
                    <Button variant="ghost" size="sm">
                      <Pencil className="size-3.5" />
                      {client.notesInternal ? "Edit" : "Add note"}
                    </Button>
                  </Link>
                </div>
                <CardDescription>
                  Notes visible only to admins — both the saved client note and any internal
                  messages tagged in the chat.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Saved client note
                  </p>
                  {client.notesInternal && client.notesInternal.trim().length > 0 ? (
                    <p className="whitespace-pre-wrap text-sm">{client.notesInternal}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No saved note. Click <strong>Add note</strong> above to write one.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Recent internal messages ({internalChatNotes.length})
                    </p>
                  </div>

                  {internalChatNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No internal chat notes yet. Toggle &ldquo;Internal note&rdquo; on the
                      Messages tab to add one.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {internalChatNotes.map(({ message, senderName }) => (
                        <div
                          key={message.id}
                          className="rounded-md border-2 border-amber-300 bg-amber-50 p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Lock className="size-3 text-amber-700" />
                              <span className="text-xs font-semibold text-amber-900">
                                {senderName ?? message.senderRole}
                              </span>
                            </div>
                            <span className="text-[10px] text-amber-700">
                              {formatDateTime(message.createdAt)}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-amber-950">
                            {message.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Blogs Tab */}
        <TabsContent value="blogs" className="pt-4">
          <BlogTable
            blogs={blogsResult.blogs}
            totalCount={blogsResult.totalCount}
            page={blogsResult.page}
            pageSize={blogsResult.pageSize}
            totalPages={blogsResult.totalPages}
            clientId={client.id}
            showClientColumn={false}
            rowTarget="posts"
          />
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent SEO Scans</CardTitle>
              <CardDescription>Last 10 scans across this client&apos;s blogs.</CardDescription>
            </CardHeader>
            <CardContent>
              {scansResult.scans.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No SEO scans yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Blog</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Pages</TableHead>
                      <TableHead>Issues</TableHead>
                      <TableHead>Critical</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scansResult.scans.map((scan) => (
                      <TableRow key={scan.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(scan.scannedAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {blogDomainById.get(scan.blogId) ?? scan.blogId.slice(0, 8)}
                        </TableCell>
                        <TableCell className={`font-medium ${getSeoScoreColor(scan.overallScore)}`}>
                          {scan.overallScore}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {scan.pagesCrawled ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {scan.issuesFound ?? 0}
                        </TableCell>
                        <TableCell>
                          {scan.criticalIssues && scan.criticalIssues > 0 ? (
                            <Badge variant="destructive">{scan.criticalIssues}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Open SEO Issues</CardTitle>
                  <CardDescription>
                    {issuesResult.total} unresolved issue{issuesResult.total === 1 ? "" : "s"}.
                  </CardDescription>
                </div>
                {issuesResult.total > 0 && (
                  <Link href={`/seo/fix-queue?clientId=${client.id}`}>
                    <Button variant="outline" size="sm">
                      <Wrench className="size-4" />
                      Fix Queue
                    </Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {issuesResult.issues.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No open issues — nice.
                </p>
              ) : (
                <div className="space-y-2">
                  {issuesResult.issues.slice(0, 10).map((issue) => (
                    <div
                      key={issue.id}
                      className="flex items-start gap-3 rounded-md border p-3"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={severityVariant[issue.severity] ?? "outline"}>
                            {issue.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{issue.category}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {blogDomainById.get(issue.blogId) ?? ""}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{issue.title}</p>
                        {issue.pageUrl && (
                          <p className="truncate text-xs text-muted-foreground">
                            {issue.pageUrl}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {issuesResult.issues.length > 10 && (
                    <p className="pt-2 text-center text-xs text-muted-foreground">
                      Showing first 10 of {issuesResult.total} issues.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages" className="pt-4">
          <Card>
            <CardContent className="p-0">
              <MessageThread clientId={client.id} messages={messages} isAdmin={true} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
