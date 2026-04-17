import Link from "next/link";
import { getClients } from "@/lib/actions/client-actions";
import { ClientTable } from "@/components/clients/client-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

interface ClientsPageProps {
  searchParams: {
    search?: string;
    status?: string;
    page?: string;
  };
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "all";
  const page = parseInt(searchParams.page ?? "1", 10);

  const data = await getClients(search, status, page, 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Manage your client accounts and billing
          </p>
        </div>
        <Link href="/clients/new">
          <Button>
            <Plus className="size-4" />
            Add Client
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <form className="flex items-center gap-3" method="get">
          <Input
            name="search"
            placeholder="Search by name or email..."
            defaultValue={search}
            className="w-64"
          />
          <select
            name="status"
            defaultValue={status}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="churned">Churned</option>
          </select>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
        </form>
      </div>

      {/* Table */}
      <ClientTable
        clients={data.clients}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
      />
    </div>
  );
}
