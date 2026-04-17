import { getSession } from "@/lib/auth/helpers";
import { redirect } from "next/navigation";
import { getMessages } from "@/lib/actions/message-actions";
import { Card, CardContent } from "@/components/ui/card";
import { MessageThread } from "@/components/messages/message-thread";

export default async function PortalMessagesPage() {
  const session = await getSession();
  if (!session || !session.user.clientId) redirect("/login");

  const messages = await getMessages({ clientId: session.user.clientId });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Messages</h1>

      <Card>
        <CardContent className="p-0">
          <MessageThread
            clientId={session.user.clientId}
            messages={messages}
            isAdmin={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
