"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import { deleteClient } from "@/lib/actions/client-actions";
import { toast } from "sonner";

interface ClientRow {
  id: string;
  name: string;
  contactEmail: string | null;
  niche: string | null;
  status: "onboarding" | "active" | "paused" | "churned" | null;
  billingStatus: "active" | "overdue" | "paused" | "cancelled" | null;
  billingAmount: string | null;
  totalBlogsTarget: number | null;
  createdAt: Date;
}

interface ClientTableProps {
  clients: ClientRow[];
  total: number;
  page: number;
  pageSize: number;
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

export function ClientTable({ clients, total, page, pageSize }: ClientTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / pageSize);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to archive "${name}"? This will set their status to churned.`)) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteClient(id);
        toast.success(`${name} has been archived`);
        router.refresh();
      } catch {
        toast.error("Failed to archive client");
      }
    });
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No clients found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Niche</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Blogs</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead className="w-[60px]">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link
                    href={`/clients/${client.id}`}
                    className="font-medium hover:underline"
                  >
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.contactEmail || "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.niche || "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={client.status ? statusVariant[client.status] ?? "secondary" : "secondary"}>
                    {client.status}
                  </Badge>
                </TableCell>
                <TableCell>{client.totalBlogsTarget ?? 0}</TableCell>
                <TableCell>
                  <Badge variant={client.billingStatus ? billingStatusVariant[client.billingStatus] ?? "secondary" : "secondary"}>
                    {client.billingStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => router.push(`/clients/${client.id}`)}
                      >
                        <Eye className="size-4" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => router.push(`/clients/${client.id}?edit=true`)}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(client.id, client.name)}
                        disabled={isPending}
                      >
                        <Trash2 className="size-4" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{" "}
            {Math.min(page * pageSize, total)} of {total} clients
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => router.push(`/clients?page=${page - 1}`)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => router.push(`/clients?page=${page + 1}`)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
