import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default async function PortalSettingsPage() {
  const session = await getSession();
  if (!session || !session.user.clientId) redirect("/login");

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, session.user.clientId))
    .limit(1);

  if (!client) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">
          Your account overview
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>
            Signed-in session details. Contact your account manager to update
            these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Name" value={session.user.name} />
          <Field label="Email" value={session.user.email} />
          <Field label="Role" value="Client" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>
            How we have you on file
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name" value={client.name} />
          <Field label="Niche" value={client.niche || "—"} />
          <Field label="Contact name" value={client.contactName || "—"} />
          <Field label="Contact email" value={client.contactEmail || "—"} />
          <Field label="Contact phone" value={client.contactPhone || "—"} />
          <Field
            label="Blog network target"
            value={`${client.totalBlogsTarget ?? 0} blogs`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className={`text-sm ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}
