import { getBlogs } from "@/lib/actions/blog-actions";
import { BlogTable } from "@/components/blogs/blog-table";
import type { BlogStatus } from "@/lib/types";

interface BlogsPageProps {
  searchParams: {
    search?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  };
}

export default async function BlogsPage({ searchParams }: BlogsPageProps) {
  const page = parseInt(searchParams.page || "1", 10);
  const pageSize = parseInt(searchParams.pageSize || "25", 10);
  const status = (searchParams.status as BlogStatus) || undefined;
  const search = searchParams.search || undefined;

  const result = await getBlogs({
    search,
    status,
    page,
    pageSize,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Blogs</h1>
        <p className="text-muted-foreground">
          Manage all blog sites across your network
        </p>
      </div>

      <BlogTable
        blogs={result.blogs}
        totalCount={result.totalCount}
        page={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
      />
    </div>
  );
}
