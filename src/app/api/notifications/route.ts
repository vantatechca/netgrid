import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  messages,
  generatedPosts,
  seoIssues,
} from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export interface NotificationItem {
  type: string;
  count: number;
  label: string;
  href: string;
  /** Optional severity for UI colour: critical | warning | info */
  severity: "critical" | "warning" | "info";
}

export interface NotificationsResponse {
  total: number;
  items: NotificationItem[];
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || (role !== "admin" && role !== "super_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 24h ago — used to scope "recent failures"
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    unreadMessages,
    offScheduleResult,
    recentFailedPublishes,
    criticalSeoIssues,
  ] = await Promise.all([
    // Messages from clients that admin hasn't read yet
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.readByAdmin, false),
          eq(messages.senderRole, "client"),
        ),
      ),

    // Off-schedule count from the LATEST verification per blog. DISTINCT ON
    // walks the (blog_id, checked_at desc) index so we never sort the full
    // history in memory.
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(
        sql`(
          SELECT DISTINCT ON (blog_id) blog_id, on_schedule
          FROM post_verifications
          ORDER BY blog_id, checked_at DESC
        ) latest`,
      )
      .where(sql`latest.on_schedule = false`),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedPosts)
      .where(
        and(
          eq(generatedPosts.status, "failed"),
          gte(generatedPosts.createdAt, dayAgo),
        ),
      ),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(seoIssues)
      .where(
        and(
          eq(seoIssues.severity, "critical"),
          sql`${seoIssues.status} IN ('detected', 'queued')`,
        ),
      ),
  ]);

  const offScheduleCount = Number(offScheduleResult[0]?.count ?? 0);

  const items: NotificationItem[] = [
    {
      type: "messages",
      count: unreadMessages[0]?.count ?? 0,
      label: "Unread client messages",
      href: "/messages",
      severity: "info",
    },
    {
      type: "off_schedule",
      count: offScheduleCount,
      label: "Blogs off posting schedule",
      href: "/posts",
      severity: "warning",
    },
    {
      type: "failed_publishes",
      count: recentFailedPublishes[0]?.count ?? 0,
      label: "Failed auto-publishes (24h)",
      href: "/blogs",
      severity: "warning",
    },
    {
      type: "critical_seo",
      count: criticalSeoIssues[0]?.count ?? 0,
      label: "Critical SEO issues",
      href: "/seo/fix-queue",
      severity: "critical",
    },
  ];

  // Total only counts non-zero items so an idle inbox shows nothing
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return NextResponse.json<NotificationsResponse>({ total, items });
}
