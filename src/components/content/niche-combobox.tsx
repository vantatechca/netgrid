"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  getNicheOptions,
  createNicheFromName,
} from "@/lib/actions/niche-actions";

interface NicheOption {
  key: string;
  label: string;
}

/**
 * Niche picker: a searchable dropdown of existing niches (from the niches DB
 * table). Typing a name that doesn't match offers "Create new niche", which
 * AI-drafts a full config, adds it to Content Studio, and selects it. Stores
 * the niche KEY as the value.
 */
export function NicheCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<NicheOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getNicheOptions()
      .then(setOptions)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const q = query.trim();
  const selected = options.find((o) => o.key === value);
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q.toLowerCase()) ||
          o.key.toLowerCase().includes(q.toLowerCase()),
      )
    : options;
  const hasExact = options.some(
    (o) =>
      o.key.toLowerCase() === q.toLowerCase() ||
      o.label.toLowerCase() === q.toLowerCase(),
  );

  async function createNew() {
    if (!q || creating) return;
    setCreating(true);
    const toastId = toast.loading(`Creating niche "${q}"…`, {
      description: "Drafting its config with AI.",
    });
    const res = await createNicheFromName(q);
    setCreating(false);
    if (res.success && res.key) {
      setOptions((prev) =>
        prev.some((o) => o.key === res.key)
          ? prev
          : [...prev, { key: res.key!, label: res.label ?? res.key! }].sort(
              (a, b) => a.label.localeCompare(b.label),
            ),
      );
      onChange(res.key);
      toast.success(res.message, { id: toastId });
      setOpen(false);
      setQuery("");
    } else {
      toast.error(res.message, { id: toastId });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.label}{" "}
              <span className="text-xs text-muted-foreground">
                {selected.key}
              </span>
            </span>
          ) : value ? (
            <span className="truncate">{value}</span>
          ) : (
            <span className="text-muted-foreground">Select a niche…</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a new niche…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!loaded ? (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading niches…
              </div>
            ) : (
              <>
                {filtered.length === 0 && !q && (
                  <CommandEmpty>No niches yet.</CommandEmpty>
                )}
                <CommandGroup>
                  {filtered.map((o) => (
                    <CommandItem
                      key={o.key}
                      value={o.key}
                      onSelect={() => {
                        onChange(o.key);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          value === o.key ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1 truncate">{o.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.key}
                      </span>
                    </CommandItem>
                  ))}
                  {q && !hasExact && (
                    <CommandItem
                      value={`__create__${q}`}
                      disabled={creating}
                      onSelect={createNew}
                    >
                      {creating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      Create new niche: &ldquo;{q}&rdquo;
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
