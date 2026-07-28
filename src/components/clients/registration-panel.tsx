"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2, Save, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  updateRegistrationConfig,
  deleteRegistrationLead,
  exportRegistrationLeadsCsv,
  type RegistrationView,
  type RegistrationPlacement,
} from "@/lib/actions/registration-actions";

function fmt(d: Date | string): string {
  return new Date(d).toLocaleString();
}

export function RegistrationPanel({
  clientId,
  view,
}: {
  clientId: string;
  view: RegistrationView;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(view.enabled);
  const [redirectUrl, setRedirectUrl] = useState(view.redirectUrl);
  const [placement, setPlacement] = useState<RegistrationPlacement>(view.placement);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pending, start] = useTransition();

  async function save() {
    setSaving(true);
    const res = await updateRegistrationConfig(clientId, {
      enabled,
      redirectUrl,
      placement,
    });
    setSaving(false);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    router.refresh();
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await exportRegistrationLeadsCsv(clientId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `registration-leads-${clientId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  function remove(id: string) {
    start(async () => {
      try {
        await deleteRegistrationLead(id);
        router.refresh();
      } catch {
        toast.error("Could not delete lead");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Config */}
      <Card>
        <CardHeader>
          <CardTitle>Registration form</CardTitle>
          <CardDescription>
            When on, a mini Name / Location / Email form is injected into this
            client&apos;s posts. Submitting it records the lead below and
            redirects the visitor to the client&apos;s own registration page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-4">
              <Label className="text-sm">Enable registration form</Label>
              <p className="text-xs text-muted-foreground">
                Injects the form into every newly generated post for this client.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="regUrl">Redirect URL (client&apos;s registration page)</Label>
              <Input
                id="regUrl"
                placeholder="https://client-site.com/register"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Where visitors land after submitting. Leave blank to just capture
                the lead and send them to the site root.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="regPlace">Placement</Label>
              <select
                id="regPlace"
                value={placement}
                onChange={(e) => setPlacement(e.target.value as RegistrationPlacement)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="top">Top only</option>
                <option value="bottom">Bottom only</option>
                <option value="top_bottom">Top &amp; bottom</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <Save className="size-4" data-icon="inline-start" />
              )}
              Save settings
            </Button>
            <p className="text-xs text-muted-foreground">
              Takes effect on the next generated post. Note: a few WordPress
              themes strip inline forms from post content.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Leads */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Leads
                <Badge variant="secondary" className="font-normal">
                  {view.leadCount}
                </Badge>
              </CardTitle>
              <CardDescription>
                Captured registrations (most recent first, latest 100 shown).
                Export pulls all of them.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={exporting || view.leadCount === 0}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              ) : (
                <Download className="size-4" data-icon="inline-start" />
              )}
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {view.recent.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No registrations yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.recent.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmt(l.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">{l.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.location || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.email || "—"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete lead"
                        onClick={() => remove(l.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
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
