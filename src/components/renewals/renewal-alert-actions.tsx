"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { acknowledgeAlert, markAsRenewed } from "@/lib/actions/renewal-actions";
import { toast } from "sonner";

export function RenewalAlertActions({ alertId }: { alertId: string }) {
  const [isPending, startTransition] = useTransition();
  const [renewDate, setRenewDate] = useState("");
  const [open, setOpen] = useState(false);

  function handleAcknowledge() {
    startTransition(async () => {
      await acknowledgeAlert(alertId);
      toast.success("Alert acknowledged");
    });
  }

  function handleRenew() {
    if (!renewDate) return;
    startTransition(async () => {
      await markAsRenewed(alertId, renewDate);
      toast.success("Marked as renewed");
      setOpen(false);
    });
  }

  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={handleAcknowledge} disabled={isPending}>
        Ack
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={isPending}>Renew</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Renewed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">New Expiry Date</label>
              <Input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} />
            </div>
            <Button onClick={handleRenew} disabled={!renewDate || isPending} className="w-full">
              Confirm Renewal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
