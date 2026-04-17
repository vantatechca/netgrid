"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { sendMessage, markMessagesRead } from "@/lib/actions/message-actions";
import { toast } from "sonner";

type Message = {
  message: {
    id: string;
    content: string;
    senderRole: string;
    isInternal: boolean | null;
    createdAt: Date;
  };
  senderName: string | null;
  senderEmail: string | null;
};

export function MessageThread({
  clientId,
  messages: initialMessages,
  isAdmin = true,
}: {
  clientId: string;
  messages: Message[];
  isAdmin?: boolean;
}) {
  const [messages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    markMessagesRead(clientId);
  }, [messages, clientId]);

  function handleSend() {
    if (!content.trim()) return;

    startTransition(async () => {
      try {
        await sendMessage({ clientId, content, isInternal });
        setContent("");
        // Refresh messages (in a real app, use SWR or react-query)
        window.location.reload();
      } catch {
        toast.error("Failed to send message");
      }
    });
  }

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.map(({ message, senderName }) => (
          <div
            key={message.id}
            className={`flex ${message.senderRole === "client" ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-4 py-2 ${
                message.senderRole === "system"
                  ? "bg-muted text-center w-full text-xs text-muted-foreground"
                  : message.senderRole === "client"
                  ? "bg-muted"
                  : message.isInternal
                  ? "bg-yellow-50 border border-yellow-200"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium">
                  {senderName || message.senderRole}
                </span>
                {message.isInternal && (
                  <Badge variant="outline" className="text-xs">Internal</Badge>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className="text-xs opacity-70 mt-1">
                {new Date(message.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-4 space-y-3">
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Switch
              id="internal"
              checked={isInternal}
              onCheckedChange={setIsInternal}
            />
            <Label htmlFor="internal" className="text-sm">
              Internal note (hidden from client)
            </Label>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder="Type a message..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <Button onClick={handleSend} disabled={isPending || !content.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
