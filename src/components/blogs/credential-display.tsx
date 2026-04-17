"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Copy } from "lucide-react";
import { toast } from "sonner";

interface CredentialDisplayProps {
  label: string;
  value: string | null;
}

export function CredentialDisplay({ label, value }: CredentialDisplayProps) {
  const [visible, setVisible] = useState(false);

  if (!value) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">Not set</p>
      </div>
    );
  }

  const maskedValue = "\u2022".repeat(Math.min(value.length, 24));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-muted px-2 py-1 text-sm font-mono break-all">
          {visible ? value : maskedValue}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setVisible(!visible)}
          title={visible ? "Hide" : "Show"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  );
}
