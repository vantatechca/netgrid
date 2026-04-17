"use client";

import { useState, useTransition, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MoreHorizontal,
  ExternalLink,
  Pencil,
  Wifi,
  Trash2,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { deleteBlog, testBlogConnection } from "@/lib/actions/blog-actions";
import { toast } from "sonner";


// ─── Types ──────────────────────────────────────────────────────────────────

interface BlogRow {
  id: string;
  clientId: string;
  clientName: string;
  domain: string;
  wpUrl: string | null;
  status: string | null;
  currentSeoScore: number | null;
  lastPostVerifiedAt: Date | null;
  lastPostTitle: string | null;
  postingFrequency: string | null;
  postingFrequencyDays: number | null;
  createdAt: Date;
}

interface BlogTableProps {
  blogs: BlogRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  clientId?: string;
  showClientColumn?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  setup: "outline",
  decommissioned: "destructive",
};

function getSeoScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 90) return "text-green-700";
  if (score >= 80) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  if (score >= 60) return "text-yellow-700";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function formatDate(date: Date | null): string {
  if (!date) return "--";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BlogTable({
  blogs,
  totalCount,
  page,
  pageSize,
  totalPages,
  clientId,
  showClientColumn = true,
}: BlogTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const buildUrl = useCallback(
    (params: Record<string, string | number>) => {
      const base = clientId ? `/clients/${clientId}/blogs` : "/blogs";
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value && value !== "all") {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      return qs ? `${base}?${qs}` : base;
    },
    [clientId]
  );

  const handleSearch = () => {
    startTransition(() => {
      router.push(
        buildUrl({
          search,
          status: statusFilter,
          page: 1,
          pageSize,
        })
      );
    });
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    startTransition(() => {
      router.push(
        buildUrl({
          search,
          status: value,
          page: 1,
          pageSize,
        })
      );
    });
  };

  const handlePageChange = (newPage: number) => {
    startTransition(() => {
      router.push(
        buildUrl({
          search,
          status: statusFilter,
          page: newPage,
          pageSize,
        })
      );
    });
  };

  const handleTestConnection = async (blogId: string, domain: string) => {
    toast.loading(`Testing connection to ${domain}...`);
    const result = await testBlogConnection(blogId);
    toast.dismiss();
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleDelete = async (blogId: string, domain: string) => {
    const result = await deleteBlog(blogId);
    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`${domain} marked as decommissioned`);
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search domains..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="setup">Setup</SelectItem>
              <SelectItem value="decommissioned">Decommissioned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() =>
            router.push(clientId ? `/blogs/new?clientId=${clientId}` : "/blogs/new")
          }
        >
          <Plus className="size-4" data-icon="inline-start" />
          Add Blog
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Domain
                  <ArrowUpDown className="size-3 text-muted-foreground" />
                </span>
              </TableHead>
              {showClientColumn && <TableHead>Client</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>SEO Score</TableHead>
              <TableHead>Last Post</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {blogs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showClientColumn ? 7 : 6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No blogs found.
                </TableCell>
              </TableRow>
            ) : (
              blogs.map((blog) => (
                <TableRow
                  key={blog.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/blogs/${blog.id}`)}
                >
                  <TableCell className="font-medium">{blog.domain}</TableCell>
                  {showClientColumn && (
                    <TableCell className="text-muted-foreground">
                      {blog.clientName}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[blog.status ?? "setup"] ?? "outline"}>
                      {blog.status ?? "setup"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`font-medium ${getSeoScoreColor(blog.currentSeoScore)}`}>
                      {blog.currentSeoScore !== null ? blog.currentSeoScore : "--"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(blog.lastPostVerifiedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {blog.postingFrequency || "--"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/blogs/${blog.id}`);
                          }}
                        >
                          <ExternalLink className="size-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/blogs/${blog.id}?edit=true`);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTestConnection(blog.id, blog.domain);
                          }}
                        >
                          <Wifi className="size-4" />
                          Test Connection
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(blog.id, blog.domain);
                          }}
                        >
                          <Trash2 className="size-4" />
                          Decommission
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}--
            {Math.min(page * pageSize, totalCount)} of {totalCount} blogs
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
