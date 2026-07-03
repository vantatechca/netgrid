import { headers } from "next/headers";
import { getMarketingApiKeyInfo } from "@/lib/actions/integration-actions";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const keyInfo = await getMarketingApiKeyInfo();

  // Best-effort base URL from the current request so the docs examples use the
  // real host the admin is browsing.
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : "https://your-netgrid-host";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Connect the marketing app to netgrid&apos;s read API — generate a key
          and follow the setup guide.
        </p>
      </div>

      <IntegrationsPanel keyInfo={keyInfo} baseUrl={baseUrl} />
    </div>
  );
}
