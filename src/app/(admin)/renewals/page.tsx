import { getRenewalAlerts } from "@/lib/actions/renewal-actions";
import { requireAdmin } from "@/lib/auth/helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RenewalAlertActions } from "@/components/renewals/renewal-alert-actions";

const alertColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-800",
  warning: "bg-yellow-100 text-yellow-800",
  urgent: "bg-orange-100 text-orange-800",
  overdue: "bg-red-100 text-red-800",
};

const typeColors: Record<string, string> = {
  domain: "bg-blue-50 text-blue-700",
  hosting: "bg-green-50 text-green-700",
  ssl: "bg-orange-50 text-orange-700",
};

export default async function RenewalsPage() {
  await requireAdmin();
  const alerts = await getRenewalAlerts();

  const overdueCount = alerts.filter((a) => a.alert.alertLevel === "overdue").length;
  const urgentCount = alerts.filter((a) => a.alert.alertLevel === "urgent").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Domain & Hosting Renewals</h1>
        <p className="text-muted-foreground">Track and manage renewal deadlines across all blogs</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Alerts</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{alerts.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{overdueCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Urgent</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-orange-600">{urgentCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Upcoming</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{alerts.length - overdueCount - urgentCount}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All Renewal Alerts</CardTitle></CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No upcoming renewals.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Blog</th>
                    <th className="text-left py-2 font-medium">Client</th>
                    <th className="text-left py-2 font-medium">Type</th>
                    <th className="text-left py-2 font-medium">Expiry</th>
                    <th className="text-left py-2 font-medium">Days Left</th>
                    <th className="text-left py-2 font-medium">Level</th>
                    <th className="text-left py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map(({ alert, blogDomain, clientName }) => (
                    <tr key={alert.id} className="border-b">
                      <td className="py-2 font-medium">{blogDomain}</td>
                      <td className="py-2">{clientName}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={typeColors[alert.renewalType] || ""}>
                          {alert.renewalType}
                        </Badge>
                      </td>
                      <td className="py-2">{alert.expiryDate}</td>
                      <td className="py-2">{alert.daysUntilExpiry ?? "—"}</td>
                      <td className="py-2">
                        <Badge className={alert.alertLevel ? alertColors[alert.alertLevel] || "" : ""}>
                          {alert.alertLevel}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <RenewalAlertActions alertId={alert.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
