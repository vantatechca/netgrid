"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  generateMarketingApiKey,
  type MarketingApiKeyInfo,
} from "@/lib/actions/integration-actions";

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label ?? "Copied"} to clipboard`);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy — copy it manually");
        }
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
        <code>{children}</code>
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={children} label="Snippet copied" />
      </div>
    </div>
  );
}

export function IntegrationsPanel({
  keyInfo,
  baseUrl,
}: {
  keyInfo: MarketingApiKeyInfo;
  baseUrl: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(keyInfo.key);
  const [source, setSource] = useState(keyInfo.source);
  const [revealed, setRevealed] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    const res = await generateMarketingApiKey();
    setGenerating(false);
    if (res.success && res.key) {
      setKey(res.key);
      setSource("stored");
      setRevealed(true);
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  }

  const masked = key ? `${key.slice(0, 6)}${"•".repeat(26)}${key.slice(-4)}` : "";
  const exampleKey = key ?? "<YOUR_API_KEY>";

  return (
    <Tabs defaultValue="key">
      <TabsList>
        <TabsTrigger value="key">API Key</TabsTrigger>
        <TabsTrigger value="howto">How to implement</TabsTrigger>
      </TabsList>

      {/* ── Tab 1: API Key ── */}
      <TabsContent value="key" className="pt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              Marketing API key
              {source === "stored" && <Badge>Active (in-app)</Badge>}
              {source === "env" && <Badge variant="secondary">From env var</Badge>}
              {source === "none" && <Badge variant="outline">Not set</Badge>}
            </CardTitle>
            <CardDescription>
              A single shared secret the marketing app uses to read clients,
              sites, and SEO scores. Generating a new key takes effect within a
              few seconds and <strong>invalidates the previous key</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {key ? (
              <div className="space-y-2">
                <Label>Current key</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={revealed ? key : masked}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRevealed((r) => !r)}
                    title={revealed ? "Hide" : "Reveal"}
                  >
                    {revealed ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                  <CopyButton value={key} label="API key copied" />
                </div>
                {source === "env" && (
                  <p className="text-xs text-muted-foreground">
                    This key comes from the <code>MARKETING_API_KEY</code>{" "}
                    environment variable. Generating a new key here stores one in
                    the database, which takes precedence.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No API key yet. Generate one to enable the marketing API.
              </p>
            )}

            <div className="flex items-center gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={generating}>
                    {generating ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 size-4" />
                    )}
                    {key ? "Generate new key" : "Generate API key"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {key ? "Rotate the API key?" : "Generate an API key?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {key
                        ? "The current key stops working immediately. Any integration using it must be updated with the new key."
                        : "This creates a secret the marketing app uses to authenticate. You can rotate it any time."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleGenerate}>
                      {key ? "Rotate key" : "Generate"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="space-y-1 border-t pt-4">
              <Label className="text-xs text-muted-foreground">Base URL</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={baseUrl} className="font-mono text-xs" />
                <CopyButton value={baseUrl} label="Base URL copied" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Note: generating a key writes to the <code>app_settings</code>{" "}
              table. If it errors, that table hasn&apos;t been created in this
              environment yet.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Tab 2: How to implement ── */}
      <TabsContent value="howto" className="space-y-4 pt-4">
        <Card>
          <CardHeader>
            <CardTitle>1. Authenticate</CardTitle>
            <CardDescription>
              Call the API from the marketing app&apos;s <strong>backend</strong>{" "}
              (server-to-server). Keep the key server-side — it returns client
              data and has no CORS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              Send the key as a header — either works:
            </p>
            <CodeBlock>{`Authorization: Bearer ${exampleKey}`}</CodeBlock>
            <CodeBlock>{`X-API-Key: ${exampleKey}`}</CodeBlock>
            <p className="text-xs text-muted-foreground">
              Responses: <code>200</code> OK · <code>401</code> wrong/missing key
              · <code>503</code> no key configured.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Endpoints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-mono text-xs">GET /api/v1/clients</p>
              <p className="text-muted-foreground">
                List clients with blog count, avg SEO score, last-post time.
                Optional <code>?email=</code> (resolve a user → client) and{" "}
                <code>?status=</code>.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs">GET /api/v1/clients/{"{clientId}"}</p>
              <p className="text-muted-foreground">
                One client with its sites (blogs) and per-site SEO scores.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs">GET /api/v1</p>
              <p className="text-muted-foreground">Self-documenting index.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">cURL</Label>
              <CodeBlock>{`curl -H "Authorization: Bearer ${exampleKey}" \\
  ${baseUrl}/api/v1/clients`}</CodeBlock>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Node (marketing app backend)
              </Label>
              <CodeBlock>{`const BASE = "${baseUrl}";
const KEY = process.env.NETGRID_API_KEY; // = the key from the API Key tab
const headers = { Authorization: \`Bearer \${KEY}\` };

// Resolve a logged-in user to their client, then load its sites + scores
const { clients } = await fetch(
  \`\${BASE}/api/v1/clients?email=\${encodeURIComponent(email)}\`,
  { headers },
).then((r) => r.json());

const client = clients[0];
const dashboard =
  client &&
  (await fetch(\`\${BASE}/api/v1/clients/\${client.id}\`, { headers }).then((r) =>
    r.json(),
  ));`}</CodeBlock>
            </div>
            <p className="text-xs text-muted-foreground">
              Set the same key as <code>NETGRID_API_KEY</code> (or similar) in the
              marketing app&apos;s server environment.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
