"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkDeleteBar } from "@/components/ui/bulk-delete-bar";
import { useRowSelection } from "@/lib/hooks/use-row-selection";
import { deleteNiches, type NicheRow } from "@/lib/actions/niche-actions";
import { DeleteNicheButton } from "@/components/niches/niche-admin";

export function NichesTable({ niches }: { niches: NicheRow[] }) {
  const router = useRouter();
  const sel = useRowSelection(niches.map((n) => n.id));

  async function batchDelete() {
    const res = await deleteNiches(sel.ids);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    sel.clear();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {sel.count > 0 && (
        <BulkDeleteBar
          count={sel.count}
          noun="niche"
          description={`This deletes ${sel.count} niche config${sel.count === 1 ? "" : "s"}. Generation falls back to code config for any deleted seed niche; re-run "Sync from code" to reseed.`}
          onClear={sel.clear}
          onConfirm={batchDelete}
        />
      )}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  aria-label="Select all niches"
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
              <TableHead>Niche</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead className="text-right">Key topics</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-[88px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {niches.map((n) => {
              const topicCount = Array.isArray(n.keyTopics)
                ? (n.keyTopics as string[]).length
                : 0;
              return (
                <TableRow key={n.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${n.label}`}
                      checked={sel.isSelected(n.id)}
                      onCheckedChange={(v) => sel.toggle(n.id, v === true)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/content-studio/niches/${n.id}`}
                      className="block hover:underline"
                    >
                      {n.label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {n.key}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {n.industry}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {topicCount}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={n.source === "manual" ? "default" : "secondary"}
                      className="font-normal"
                    >
                      {n.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <DeleteNicheButton
                        nicheId={n.id}
                        nicheLabel={n.label}
                        compact
                      />
                      <Link
                        href={`/content-studio/niches/${n.id}`}
                        aria-label={`Edit ${n.label}`}
                      >
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
