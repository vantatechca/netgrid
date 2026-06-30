import Link from "next/link";
import { getBlogsByClient } from "@/lib/actions/blog-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className={`text-lg font-semibold tabular-nums ${tone ?? "text-foreground"}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function BlogsPage() {
  const clients = await getBlogsByClient();

  const totalBlogs = clients.reduce((sum, c) => sum + c.totalBlogs, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Blogs</h1>
        <p className="text-muted-foreground">
          Blog sites grouped by client. Open a client to manage their sites and
          add new blogs.
        </p>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No blogs yet. Add a client&apos;s first blog from the client page.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {clients.length} client{clients.length === 1 ? "" : "s"} ·{" "}
            {totalBlogs} blog{totalBlogs === 1 ? "" : "s"}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <Link
                key={client.clientId}
                href={`/clients/${client.clientId}/blogs`}
                className="group block"
              >
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="space-y-4 py-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Globe className="size-4 shrink-0 text-muted-foreground" />
                        <p className="truncate font-semibold group-hover:text-primary">
                          {client.clientName}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {client.clientStatus && (
                          <Badge variant="outline" className="font-normal">
                            {client.clientStatus}
                          </Badge>
                        )}
                        <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-y-3">
                      <Stat label="Blogs" value={client.totalBlogs} />
                      <Stat
                        label="Active"
                        value={client.activeBlogs}
                        tone="text-green-600"
                      />
                      <Stat
                        label="Avg SEO"
                        value={client.avgSeoScore ?? "—"}
                        tone={scoreTone(client.avgSeoScore)}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Last post {formatDate(client.lastPostAt)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
