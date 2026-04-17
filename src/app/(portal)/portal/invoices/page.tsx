import { getInvoices } from "@/lib/actions/invoice-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PortalInvoicesPage() {
  const { invoices } = await getInvoices();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Invoices</h1>

      <Card>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No invoices.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 font-medium">Invoice #</th>
                    <th className="text-left py-3 font-medium">Amount</th>
                    <th className="text-left py-3 font-medium">Due Date</th>
                    <th className="text-left py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(({ invoice }) => (
                    <tr key={invoice.id} className="border-b">
                      <td className="py-3 font-mono">{invoice.invoiceNumber}</td>
                      <td className="py-3 font-medium">${Number(invoice.amount).toLocaleString()} {invoice.currency}</td>
                      <td className="py-3">{invoice.dueDate}</td>
                      <td className="py-3">
                        <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "overdue" ? "destructive" : "secondary"}>
                          {invoice.status}
                        </Badge>
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
