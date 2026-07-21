"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setClientLinkExchange } from "@/lib/actions/link-exchange-actions";

export function ClientOptInToggle({
  clientId,
  enabled,
}: {
  clientId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    setOn(next);
    start(async () => {
      const res = await setClientLinkExchange(clientId, next);
      if (res.success) {
        toast.success(res.message);
        router.refresh();
      } else {
        setOn(!next);
        toast.error(res.message);
      }
    });
  }

  return (
    <Switch checked={on} onCheckedChange={toggle} disabled={pending} aria-label="Toggle link exchange" />
  );
}
