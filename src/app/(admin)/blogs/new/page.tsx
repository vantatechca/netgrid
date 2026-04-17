import { BlogForm } from "@/components/blogs/blog-form";
import { getClientsForSelect } from "@/lib/actions/blog-actions";

interface NewBlogPageProps {
  searchParams: {
    clientId?: string;
  };
}

export default async function NewBlogPage({ searchParams }: NewBlogPageProps) {
  const clients = await getClientsForSelect();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add Blog</h1>
        <p className="text-muted-foreground">
          Register a new blog in the network
        </p>
      </div>

      <BlogForm
        mode="create"
        clients={clients}
        defaultClientId={searchParams.clientId}
      />
    </div>
  );
}
