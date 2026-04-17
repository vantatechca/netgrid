import { getInvoices, getRevenueStats } from "@/lib/actions/invoice-actions";
import { requireAdmin } from "@/lib/auth/helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export default async function InvoicesPage() {
  await requireAdmin();

  const [{ invoices }, revenue] = await Promise.all([
    getInvoices(),
    getRevenueStats(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoicing & Billing</h1>
          <p className="text-muted-foreground">Manage invoices and track revenue</p>
        </div>
        <Link href="/clients">
          <Button>Create Invoice</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">MRR</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${revenue.mrr.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">ARR</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${revenue.arr.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">${revenue.overdueTotal.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Upcoming (30d)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${revenue.upcomingTotal.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overdue Count</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{revenue.overdueCount}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All Invoices</CardTitle></CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Invoice #</th>
                    <th className="text-left py-2 font-medium">Client</th>
                    <th className="text-left py-2 font-medium">Amount</th>
                    <th className="text-left py-2 font-medium">Due Date</th>
                    <th className="text-left py-2 font-medium">Status</th>
                    <th className="text-left py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(({ invoice, clientName }) => (
                    <tr key={invoice.id} className="border-b">
                      <td className="py-2 font-mono">{invoice.invoiceNumber}</td>
                      <td className="py-2">{clientName}</td>
                      <td className="py-2 font-medium">${Number(invoice.amount).toLocaleString()} {invoice.currency}</td>
                      <td className="py-2">{invoice.dueDate}</td>
                      <td className="py-2">
                        <Badge className={invoice.status ? statusColors[invoice.status] || "" : ""}>{invoice.status}</Badge>
                      </td>
                      <td className="py-2">
                        <Button size="sm" variant="outline">View</Button>
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
