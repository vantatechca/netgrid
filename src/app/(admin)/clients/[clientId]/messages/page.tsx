import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/helpers";
import { getClient } from "@/lib/actions/client-actions";
import { getMessages } from "@/lib/actions/message-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageThread } from "@/components/messages/message-thread";
import { ArrowLeft } from "lucide-react";

interface ClientMessagesPageProps {
  params: { clientId: string };
}

export default async function ClientMessagesPage({
  params,
}: ClientMessagesPageProps) {
  await requireAdmin();

  let client;
  try {
    client = await getClient(params.clientId);
  } catch {
    notFound();
  }

  const messages = await getMessages({ clientId: params.clientId });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/messages">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">
            Messages thread &middot; {client.contactEmail || "—"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <MessageThread
            clientId={params.clientId}
            messages={messages}
            isAdmin={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}
