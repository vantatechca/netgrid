"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** Interval in ms. Default 15 seconds. */
  intervalMs?: number;
}

/**
 * Drop-in `<AutoRefresh />` for any server-rendered page that should poll for
 * fresh data. Calls Next.js's router.refresh() which re-runs the server
 * component and streams the updated tree without a full reload.
 */
export function AutoRefresh({ intervalMs = 15000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}