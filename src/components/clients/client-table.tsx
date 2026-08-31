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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Pencil, Trash2, Pause, Play } from "lucide-react";
import { BulkDeleteBar } from "@/components/ui/bulk-delete-bar";
import { useRowSelection } from "@/lib/hooks/use-row-selection";
import { deleteClient, deleteClients, pauseClient, unpauseClient } from "@/lib/actions/client-actions";
import { toast } from "sonner";

interface ClientRow {
  id: string;
  name: string;
  contactEmail: string | null;
  niche: string | null;
  status: "onboarding" | "active" | "paused" | "churned" | null;
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

export function ClientTable({ clients, total, page, pageSize }: ClientTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const sel = useRowSelection(clients.map((c) => c.id));

  const totalPages = Math.ceil(total / pageSize);

  async function batchArchive() {
    const res = await deleteClients(sel.ids);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    sel.clear();
    router.refresh();
  }

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

  function handleTogglePause(id: string, name: string, status: ClientRow["status"]) {
    const pausing = status !== "paused";

    startTransition(async () => {
      try {
        if (pausing) {
          await pauseClient(id);
          toast.success(`${name} is paused — no posts will be generated or published for it`);
        } else {
          await unpauseClient(id);
          toast.success(`${name} is active again`);
        }
        router.refresh();
      } catch {
        toast.error(pausing ? "Failed to pause client" : "Failed to unpause client");
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
      {sel.count > 0 && (
        <BulkDeleteBar
          count={sel.count}
          noun="client"
          actionLabel="Archive"
          description={`This archives ${sel.count} client${sel.count === 1 ? "" : "s"} (sets their status to churned). You can still find them by filtering for churned clients.`}
          onClear={sel.clear}
          onConfirm={batchArchive}
        />
      )}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  aria-label="Select all clients"
                  checked={
                    sel.allSelected
                      ? true
                      : sel.someSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(v) => sel.toggleAll(v === true)}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Niche</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Blogs</TableHead>
              <TableHead className="w-[60px]">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${client.name}`}
                    checked={sel.isSelected(client.id)}
                    onCheckedChange={(v) => sel.toggle(client.id, v === true)}
                  />
                </TableCell>
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
                        onClick={() => handleTogglePause(client.id, client.name, client.status)}
                        disabled={isPending}
                      >
                        {client.status === "paused" ? (
                          <>
                            <Play className="size-4" />
                            Unpause
                          </>
                        ) : (
                          <>
                            <Pause className="size-4" />
                            Pause
                          </>
                        )}
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
