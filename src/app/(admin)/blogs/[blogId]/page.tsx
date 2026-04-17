import { notFound } from "next/navigation";
import Link from "next/link";
import { getBlog, getClientsForSelect } from "@/lib/actions/blog-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CredentialDisplay } from "@/components/blogs/credential-display";
import { WpConnectionTest } from "@/components/blogs/wp-connection-test";
import { BlogForm } from "@/components/blogs/blog-form";
import {
  ArrowLeft,
  Pencil,
  Globe,
  Server,
  ShieldCheck,
  Calendar,
  FileText,
  BarChart3,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BlogDetailPageProps {
  params: { blogId: string };
  searchParams: { edit?: string };
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  setup: "outline",
  decommissioned: "destructive",
};

function formatDate(value: string | Date | null): string {
  if (!value) return "--";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "--"}</p>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function BlogDetailPage({
  params,
  searchParams,
}: BlogDetailPageProps) {
  const blog = await getBlog(params.blogId);

  if ("error" in blog) {
    notFound();
  }

  const isEditMode = searchParams.edit === "true";

  // In edit mode, show form
  if (isEditMode) {
    const clients = await getClientsForSelect();
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link href={`/blogs/${params.blogId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit {blog.domain}</h1>
            <p className="text-muted-foreground">Update blog configuration</p>
          </div>
        </div>

        <BlogForm
          mode="edit"
          blogId={params.blogId}
          clients={clients}
          defaultValues={{
            clientId: blog.clientId,
            domain: blog.domain,
            wpUrl: blog.wpUrl || "",
            wpUsername: blog.wpUsername || "",
            wpAppPassword: blog.wpAppPassword || "",
            seoPlugin: (blog.seoPlugin as "yoast" | "rankmath" | "none") || "none",
            hostingProvider: blog.hostingProvider || "",
            hostingLoginUrl: blog.hostingLoginUrl || "",
            hostingUsername: blog.hostingUsername || "",
            hostingPassword: blog.hostingPassword || "",
            registrar: blog.registrar || "",
            registrarLoginUrl: blog.registrarLoginUrl || "",
            registrarUsername: blog.registrarUsername || "",
            registrarPassword: blog.registrarPassword || "",
            domainExpiryDate: blog.domainExpiryDate || "",
            hostingExpiryDate: blog.hostingExpiryDate || "",
            sslExpiryDate: blog.sslExpiryDate || "",
            postingFrequency: blog.postingFrequency || "",
            postingFrequencyDays: blog.postingFrequencyDays ?? undefined,
            status: (blog.status as "active" | "paused" | "setup" | "decommissioned") || "setup",
            notesInternal: blog.notesInternal || "",
          }}
        />
      </div>
    );
  }

  // Detail view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/blogs">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{blog.domain}</h1>
              <Badge variant={STATUS_VARIANTS[blog.status ?? "setup"] ?? "outline"}>
                {blog.status ?? "setup"}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Client: {blog.clientName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WpConnectionTest blogId={params.blogId} />
          <Link href={`/blogs/${params.blogId}?edit=true`}>
            <Button variant="outline">
              <Pencil className="size-4" data-icon="inline-start" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" />
              Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Domain" value={blog.domain} />
            <InfoRow label="WordPress URL" value={blog.wpUrl} />
            <InfoRow label="SEO Plugin" value={blog.seoPlugin} />
            <InfoRow label="Status" value={blog.status} />
          </CardContent>
        </Card>

        {/* WordPress Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              WordPress Credentials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CredentialDisplay label="Username" value={blog.wpUsername} />
            <CredentialDisplay label="Application Password" value={blog.wpAppPassword} />
          </CardContent>
        </Card>

        {/* Hosting */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" />
              Hosting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Provider" value={blog.hostingProvider} />
            <InfoRow label="Login URL" value={blog.hostingLoginUrl} />
            <CredentialDisplay label="Username" value={blog.hostingUsername} />
            <CredentialDisplay label="Password" value={blog.hostingPassword} />
            <InfoRow label="Expiry Date" value={blog.hostingExpiryDate} />
          </CardContent>
        </Card>

        {/* Registrar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" />
              Domain Registrar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Registrar" value={blog.registrar} />
            <InfoRow label="Login URL" value={blog.registrarLoginUrl} />
            <CredentialDisplay label="Username" value={blog.registrarUsername} />
            <CredentialDisplay label="Password" value={blog.registrarPassword} />
            <InfoRow label="Domain Expiry" value={blog.domainExpiryDate} />
          </CardContent>
        </Card>

        {/* SSL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              SSL Certificate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="SSL Expiry Date" value={blog.sslExpiryDate} />
          </CardContent>
        </Card>

        {/* Posting Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-4" />
              Posting Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <InfoRow label="Frequency" value={blog.postingFrequency} />
            <InfoRow
              label="Frequency (days)"
              value={blog.postingFrequencyDays?.toString() ?? null}
            />
            <InfoRow
              label="Last Post Verified"
              value={formatDate(blog.lastPostVerifiedAt)}
            />
            <InfoRow label="Last Post Title" value={blog.lastPostTitle} />
          </CardContent>
        </Card>

        {/* SEO Snapshot */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4" />
              SEO Snapshot
            </CardTitle>
            <CardDescription>Latest SEO scan results</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <InfoRow
              label="Current Score"
              value={
                blog.currentSeoScore !== null
                  ? `${blog.currentSeoScore}/100`
                  : null
              }
            />
            <InfoRow
              label="Last Scan"
              value={formatDate(blog.lastSeoScanAt)}
            />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              Internal Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {blog.notesInternal ? (
              <p className="text-sm whitespace-pre-wrap">{blog.notesInternal}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
