import { getBlogs } from "@/lib/actions/blog-actions";
import { BlogTable } from "@/components/blogs/blog-table";
import { CsvImportDialog } from "@/components/blogs/csv-import-dialog";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { BlogStatus } from "@/lib/types";

interface ClientBlogsPageProps {
  params: { clientId: string };
  searchParams: {
    search?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  };
}

export default async function ClientBlogsPage({
  params,
  searchParams,
}: ClientBlogsPageProps) {
  // Verify client exists
  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.id, params.clientId));

  if (!client) {
    notFound();
  }

  const page = parseInt(searchParams.page || "1", 10);
  const pageSize = parseInt(searchParams.pageSize || "25", 10);
  const status = (searchParams.status as BlogStatus) || undefined;
  const search = searchParams.search || undefined;

  const result = await getBlogs({
    clientId: params.clientId,
    search,
    status,
    page,
    pageSize,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {client.name} - Blogs
          </h1>
          <p className="text-muted-foreground">
            Manage blogs for this client
          </p>
        </div>
        <CsvImportDialog clientId={params.clientId} />
      </div>

      <BlogTable
        blogs={result.blogs}
        totalCount={result.totalCount}
        page={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
        clientId={params.clientId}
        showClientColumn={false}
      />
    </div>
  );
}
