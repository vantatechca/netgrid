"use server";

import { db } from "@/lib/db";
import { linkEvents } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";

export interface TrafficTotals {
  views: number;
  clicks: number;
}

function tally(rows: { type: string; c: number }[]): TrafficTotals {
  let views = 0;
  let clicks = 0;
  for (const r of rows) {
    if (r.type === "view") views = Number(r.c);
    else if (r.type === "cta_click") clicks = Number(r.c);
  }
  return { views, clicks };
}

/** Page-view + CTA-click totals for one blog. Fail-safe to zeros. */
export async function getBlogTrafficTotals(
  blogId: string,
): Promise<TrafficTotals> {
  await requireAdmin();
  try {
    const rows = await db
      .select({ type: linkEvents.type, c: count() })
      .from(linkEvents)
      .where(eq(linkEvents.blogId, blogId))
      .groupBy(linkEvents.type);
    return tally(rows);
  } catch {
    return { views: 0, clicks: 0 };
  }
}

/** Page-view + CTA-click totals for one client (across all its blogs). */
export async function getClientTrafficTotals(
  clientId: string,
): Promise<TrafficTotals> {
  await requireAdmin();
  try {
    const rows = await db
      .select({ type: linkEvents.type, c: count() })
      .from(linkEvents)
      .where(eq(linkEvents.clientId, clientId))
      .groupBy(linkEvents.type);
    return tally(rows);
  } catch {
    return { views: 0, clicks: 0 };
  }
}
