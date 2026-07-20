"use client";

import { useRouter } from "next/navigation";

interface ClientOption {
  id: string;
  name: string;
}

/**
 * Client dropdown for the All Posts page. Navigates to /all-posts with the
 * chosen client id while preserving the active status filter. Rendered as a
 * native <select> so it works without pulling in the Radix client bundle.
 */
export function AllPostsClientFilter({
  clients,
  status,
  selected,
}: {
  clients: ClientOption[];
  status: string;
  selected: string;
}) {
  const router = useRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (value) params.set("client", value);
    const qs = params.toString();
    router.push(qs ? `/all-posts?${qs}` : "/all-posts");
  }

  return (
    <select
      value={selected}
      onChange={handleChange}
      aria-label="Filter by client"
      className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">All clients</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
