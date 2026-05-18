"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { publishReport, unpublishReport } from "@/lib/actions/report-actions";

interface Props {
  reportId: string;
  isPublished: boolean;
}

export function PublishToggle({ reportId, isPublished: initialPublished }: Props) {
  const router = useRouter();
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      try {
        if (isPublished) {
          await unpublishReport(reportId);
          setIsPublished(false);
          toast.success("Report hidden from client");
        } else {
          await publishReport(reportId);
          setIsPublished(true);
          toast.success("Report published — client can now see it");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <Button
      variant={isPublished ? "outline" : "default"}
      onClick={handleToggle}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : isPublished ? (
        <EyeOff className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
      {isPublished ? "Hide from client" : "Publish to client"}
    </Button>
  );
}