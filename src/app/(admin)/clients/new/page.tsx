import Link from "next/link";
import { ClientForm } from "@/components/clients/client-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Add Client</h1>
          <p className="text-sm text-muted-foreground">
            Create a new client account
          </p>
        </div>
      </div>

      {/* Form */}
      <ClientForm mode="create" />
    </div>
  );
}
