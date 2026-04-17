import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getClientStats } from "@/lib/actions/client-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Pencil,
  Globe,
  BarChart3,
  FileText,
  MessageSquare,
  CreditCard,
} from "lucide-react";

interface ClientDetailPageProps {
  params: { clientId: string };
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  onboarding: "secondary",
  paused: "outline",
  churned: "destructive",
};

const billingStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  overdue: "destructive",
  paused: "outline",
  cancelled: "destructive",
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  let client;
  let stats;

  try {
    [client, stats] = await Promise.all([
      getClient(params.clientId),
      getClientStats(params.clientId),
    ]);
  } catch {
    notFound();
  }

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
              <h1 className="text-2xl font-semibold tracking-tight">
                {client.name}
              </h1>
              <Badge variant={client.status ? statusVariant[client.status] ?? "secondary" : "secondary"}>
                {client.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {client.niche ? `${client.niche} \u00B7 ` : ""}
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
            <CardTitle className="text-2xl">
              {stats.avgSeoScore !== null ? stats.avgSeoScore : "-"}
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
            <CardDescription>Billing Status</CardDescription>
            <CardTitle className="text-2xl">
              <Badge variant={billingStatusVariant[client.billingStatus ?? "active"] ?? "secondary"}>
                {client.billingStatus}
              </Badge>
            </CardTitle>
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
            Blogs
          </TabsTrigger>
          <TabsTrigger value="seo">
            <BarChart3 className="size-4" />
            SEO
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare className="size-4" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="size-4" />
            Billing
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 pt-4 lg:grid-cols-2">
            {/* Client Info */}
            <Card>
              <CardHeader>
                <CardTitle>Client Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Company Name
                    </p>
                    <p className="text-sm">{client.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Niche
                    </p>
                    <p className="text-sm">{client.niche || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Contact Name
                    </p>
                    <p className="text-sm">{client.contactName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Contact Email
                    </p>
                    <p className="text-sm">{client.contactEmail || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Contact Phone
                    </p>
                    <p className="text-sm">{client.contactPhone || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Blog Target
                    </p>
                    <p className="text-sm">
                      {client.totalBlogsTarget ?? 0} blogs
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Info */}
            <Card>
              <CardHeader>
                <CardTitle>Billing Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Billing Type
                    </p>
                    <p className="text-sm capitalize">
                      {client.billingType?.replace("_", " ") || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Amount
                    </p>
                    <p className="text-sm">
                      ${client.billingAmount || "0.00"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Setup Fee
                    </p>
                    <p className="text-sm">
                      ${client.setupFee || "0.00"}
                      {client.setupFeePaid ? " (paid)" : " (unpaid)"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Billing Start
                    </p>
                    <p className="text-sm">
                      {client.billingStartDate
                        ? new Date(client.billingStartDate).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Next Billing Date
                    </p>
                    <p className="text-sm">
                      {client.nextBillingDate
                        ? new Date(client.nextBillingDate).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Active Invoices
                    </p>
                    <p className="text-sm">{stats.activeInvoices}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Internal Notes */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Internal Notes</CardTitle>
              </CardHeader>
              <CardContent>
                {client.notesInternal ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {client.notesInternal}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No internal notes.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Blogs Tab */}
        <TabsContent value="blogs">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-3 size-10 text-muted-foreground/50" />
            <p className="font-medium">Blog Management</p>
            <p className="text-sm text-muted-foreground">
              Blog management for this client will appear here.
            </p>
          </div>
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="mb-3 size-10 text-muted-foreground/50" />
            <p className="font-medium">SEO Analytics</p>
            <p className="text-sm text-muted-foreground">
              SEO scan results and analytics will appear here.
            </p>
          </div>
        </TabsContent>

        {/* Messages Tab */}
        <TabsContent value="messages">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="mb-3 size-10 text-muted-foreground/50" />
            <p className="font-medium">Messages</p>
            <p className="text-sm text-muted-foreground">
              Client messages and communication will appear here.
              {stats.messageCount > 0 && ` (${stats.messageCount} messages)`}
            </p>
          </div>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard className="mb-3 size-10 text-muted-foreground/50" />
            <p className="font-medium">Billing & Invoices</p>
            <p className="text-sm text-muted-foreground">
              Invoices and billing history will appear here.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
