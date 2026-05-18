"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getMessages,
  markMessagesRead,
  sendMessage,
} from "@/lib/actions/message-actions";
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

const POLL_INTERVAL_MS = 5000;
const SCROLL_BOTTOM_THRESHOLD_PX = 120;

/** Sort oldest → newest so newest naturally lands at the bottom of the scroll. */
function chronological(arr: Message[]): Message[] {
  return [...arr].sort(
    (a, b) =>
      new Date(a.message.createdAt).getTime() -
      new Date(b.message.createdAt).getTime(),
  );
}

export function MessageThread({
  clientId,
  messages: initialMessages,
  isAdmin = true,
}: {
  clientId: string;
  messages: Message[];
  isAdmin?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(() =>
    chronological(initialMessages),
  );
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Whether the user was at the bottom of the scroll container right before
  // the next state update. Used to decide whether to auto-scroll on new msgs.
  const wasAtBottomRef = useRef(true);

  function isNearBottom(): boolean {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight <
      SCROLL_BOTTOM_THRESHOLD_PX
    );
  }

  // 1. On mount: snap to the bottom (no animation) and mark unread as read.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
    markMessagesRead(clientId).catch(() => {
      // non-fatal
    });
  }, [clientId]);

  // 2. Poll for new messages every POLL_INTERVAL_MS. Doesn't touch the parent
  //    page or router — so the parent's tab state stays put. Updates only when
  //    something actually changed (length or newest-id differs).
  const refresh = useCallback(async () => {
    try {
      const fresh = await getMessages({ clientId, pageSize: 200 });
      const ordered = chronological(fresh);

      setMessages((prev) => {
        const sameLength = prev.length === ordered.length;
        const sameLast =
          sameLength &&
          prev.length > 0 &&
          prev[prev.length - 1].message.id ===
            ordered[ordered.length - 1].message.id;
        if (sameLength && sameLast) return prev;
        // Capture scroll position BEFORE state-driven re-render
        wasAtBottomRef.current = isNearBottom();
        return ordered;
      });

      markMessagesRead(clientId).catch(() => {});
    } catch {
      // Silent — polling is best-effort
    }
  }, [clientId]);

  useEffect(() => {
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // 3. After messages update, auto-scroll only if the user was at the bottom.
  //    If they scrolled up to read history, leave them where they are.
  useEffect(() => {
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function handleSend() {
    const text = content.trim();
    if (!text) return;
    setContent("");
    wasAtBottomRef.current = true; // user just sent → keep them at bottom

    startTransition(async () => {
      try {
        await sendMessage({ clientId, content: text, isInternal });
        // Refetch right away to pick up our own message + anything new
        const fresh = await getMessages({ clientId, pageSize: 200 });
        setMessages(chronological(fresh));
      } catch {
        toast.error("Failed to send message");
        setContent(text); // restore so the user can retry
      }
    });
  }

  return (
    <div className="flex flex-col h-[600px]">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto space-y-3 p-4"
      >
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Say hi.
          </p>
        ) : (
          messages.map(({ message, senderName }) => (
            <div
              key={message.id}
              className={`flex ${
                message.senderRole === "client" ? "justify-start" : "justify-end"
              }`}
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
                    <Badge variant="outline" className="text-xs">
                      Internal
                    </Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(message.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
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