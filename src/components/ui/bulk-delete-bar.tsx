"use client";

import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Sticky action bar for multi-select tables. Renders nothing when the selection
 * is empty. Clicking the destructive button opens a confirm dialog; `onConfirm`
 * runs the batch action and the dialog closes when it resolves.
 */
export function BulkDeleteBar({
  count,
  noun,
  onClear,
  onConfirm,
  actionLabel = "Delete",
  description,
  disabled = false,
  className,
}: {
  count: number;
  /** Singular noun for a row, e.g. "keyword" → "3 keywords selected". */
  noun: string;
  onClear: () => void;
  /** Runs the batch action. The dialog closes once it resolves. */
  onConfirm: () => Promise<void>;
  /** Verb shown on the button/dialog. Defaults to "Delete" (use "Archive" etc.). */
  actionLabel?: string;
  /** Overrides the confirm-dialog body. */
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (count === 0) return null;

  const plural = count === 1 ? noun : `${noun}s`;
  const verb = actionLabel.toLowerCase();

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2",
        className,
      )}
    >
      <span className="text-sm font-medium">
        {count} {plural} selected
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
          <X className="size-4" />
          Clear
        </Button>
        <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={disabled}>
              <Trash2 className="size-4" />
              {actionLabel} {count}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {actionLabel} {count} {plural}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {description ??
                  `This will ${verb} ${count} ${plural}. This action can't be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  run();
                }}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {actionLabel}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
