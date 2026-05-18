import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-5xl font-bold tracking-tight">404</h1>
        <h2 className="text-xl font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The record or page you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button>Go to dashboard</Button>
          </Link>
          <Link href="/blogs">
            <Button variant="outline">Browse blogs</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
