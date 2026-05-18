import { notFound } from "next/navigation";
import Link from "next/link";
import { getBlog, getBlogPosts } from "@/lib/actions/blog-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlogPostsPanel } from "@/components/blogs/blog-posts-panel";
import { ArrowLeft, Settings } from "lucide-react";

interface PostsPageProps {
  params: { blogId: string };
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  setup: "outline",
  decommissioned: "destructive",
};

export default async function BlogPostsPage({ params }: PostsPageProps) {
  const blog = await getBlog(params.blogId);
  if ("error" in blog) notFound();

  const postsResult = await getBlogPosts(params.blogId).catch((err) => ({
    generated: [],
    live: {
      available: false,
      platform: blog.platform,
      posts: [],
      page: 1,
      perPage: 20,
      total: 0,
      totalPages: 0,
      error: err instanceof Error ? err.message : "Failed to load posts",
    },
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/clients/${blog.clientId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{blog.domain}</h1>
              <Badge variant={STATUS_VARIANTS[blog.status ?? "setup"] ?? "outline"}>
                {blog.status ?? "setup"}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {blog.clientName} · {blog.platform}
        
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/blogs/${params.blogId}`}>
            <Button variant="outline">
              <Settings className="size-4" />
              Blog settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Posts panel (generated + live WP, with edit/delete) */}
      <BlogPostsPanel
        blogId={params.blogId}
        generated={postsResult.generated}
        live={postsResult.live}
      />
    </div>
  ); 
}