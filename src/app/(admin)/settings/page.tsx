import { requireAdmin } from "@/lib/auth/helpers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const session = await requireAdmin();

  const integrations = [
    {
      name: "Shopify",
      description: "Sync products and orders for e-commerce clients.",
      envKey: "SHOPIFY_API_KEY",
      connected: Boolean(process.env.SHOPIFY_API_KEY),
    },
    {
      name: "WordPress",
      description: "Content publishing and SEO monitoring via WP REST API.",
      envKey: "WP_APP_PASSWORD",
      connected: Boolean(process.env.WP_APP_PASSWORD),
    },
    {
      name: "Resend",
      description: "Transactional email for magic links and notifications.",
      envKey: "RESEND_API_KEY",
      connected: Boolean(process.env.RESEND_API_KEY),
    },
    {
      name: "Anthropic (Claude)",
      description: "AI-generated report summaries and SEO fixes.",
      envKey: "ANTHROPIC_API_KEY",
      connected: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          System configuration and integration status
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <p className="text-sm">{session.user.name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm">{session.user.email}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role</Label>
              <p className="text-sm capitalize">
                {session.user.role.replace("_", " ")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connected third-party services. Configure via environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {integrations.map((integration, i) => (
            <div key={integration.name}>
              {i > 0 && <Separator className="mb-4" />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{integration.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {integration.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    {integration.envKey}
                  </p>
                </div>
                <Badge variant={integration.connected ? "default" : "outline"}>
                  {integration.connected ? "Connected" : "Not configured"}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automated Jobs</CardTitle>
          <CardDescription>
            Background cron jobs run on a schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>SEO scan (daily)</span>
            <span className="text-muted-foreground font-mono">
              /api/cron/seo-scan
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Post verification (daily)</span>
            <span className="text-muted-foreground font-mono">
              /api/cron/post-verification
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Monthly reports (1st of month)</span>
            <span className="text-muted-foreground font-mono">
              /api/cron/monthly-reports
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
