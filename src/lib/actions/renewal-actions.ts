"use server";

import { db } from "@/lib/db";
import { blogs, renewalAlerts, clients } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/helpers";
import { logActivity } from "@/lib/services/activity-logger";
import { RENEWAL_THRESHOLDS } from "@/lib/constants";

export async function getRenewalAlerts(params?: {
  clientId?: string;
  alertLevel?: string;
  acknowledged?: boolean;
  page?: number;
  pageSize?: number;
}) {
  await requireAdmin();
  const { clientId, alertLevel, acknowledged, page = 1, pageSize = 50 } = params || {};

  const conditions = [];
  if (clientId) conditions.push(eq(renewalAlerts.clientId, clientId));
  if (alertLevel) conditions.push(eq(renewalAlerts.alertLevel, alertLevel as "info" | "warning" | "urgent" | "overdue"));
  if (acknowledged !== undefined) conditions.push(eq(renewalAlerts.acknowledged, acknowledged));
  conditions.push(eq(renewalAlerts.renewed, false));

  const where = and(...conditions);

  const alerts = await db.select({
    alert: renewalAlerts,
    blogDomain: blogs.domain,
    clientName: clients.name,
  })
    .from(renewalAlerts)
    .innerJoin(blogs, eq(renewalAlerts.blogId, blogs.id))
    .innerJoin(clients, eq(renewalAlerts.clientId, clients.id))
    .where(where)
    .orderBy(
      sql`CASE WHEN ${renewalAlerts.alertLevel} = 'overdue' THEN 0 WHEN ${renewalAlerts.alertLevel} = 'urgent' THEN 1 WHEN ${renewalAlerts.alertLevel} = 'warning' THEN 2 ELSE 3 END`,
      desc(renewalAlerts.createdAt)
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return alerts;
}

export async function acknowledgeAlert(alertId: string) {
  const session = await requireAdmin();

  await db.update(renewalAlerts).set({ acknowledged: true }).where(eq(renewalAlerts.id, alertId));

  await logActivity({
    userId: session.user.id,
    action: "renewal_alert_acknowledged",
    entityType: "renewal_alert",
    entityId: alertId,
  });
}

export async function markAsRenewed(alertId: string, newExpiryDate: string) {
  const session = await requireAdmin();

  const [alert] = await db.select().from(renewalAlerts).where(eq(renewalAlerts.id, alertId)).limit(1);
  if (!alert) throw new Error("Alert not found");

  // Update the alert
  await db.update(renewalAlerts).set({
    renewed: true,
    renewedUntil: newExpiryDate,
  }).where(eq(renewalAlerts.id, alertId));

  // Update the blog's expiry date
  const updateData: Record<string, string> = {};
  if (alert.renewalType === "domain") updateData.domainExpiryDate = newExpiryDate;
  if (alert.renewalType === "hosting") updateData.hostingExpiryDate = newExpiryDate;
  if (alert.renewalType === "ssl") updateData.sslExpiryDate = newExpiryDate;

  if (Object.keys(updateData).length > 0) {
    await db.update(blogs).set({
      ...updateData,
      updatedAt: new Date(),
    } as Record<string, unknown>).where(eq(blogs.id, alert.blogId));
  }

  await logActivity({
    userId: session.user.id,
    clientId: alert.clientId,
    action: "renewal_completed",
    entityType: "renewal_alert",
    entityId: alertId,
    details: { renewalType: alert.renewalType, newExpiryDate, oldExpiryDate: alert.expiryDate },
  });
}

// Called by cron job to scan for upcoming renewals
export async function scanRenewals() {
  const activeBlogs = await db.select().from(blogs).where(eq(blogs.status, "active"));

  const today = new Date();
  const alertsToCreate: {
    blogId: string;
    clientId: string;
    renewalType: "domain" | "hosting" | "ssl";
    expiryDate: string;
    daysUntilExpiry: number;
    alertLevel: "info" | "warning" | "urgent" | "overdue";
  }[] = [];

  for (const blog of activeBlogs) {
    const expiryFields: { type: "domain" | "hosting" | "ssl"; date: string | null }[] = [
      { type: "domain", date: blog.domainExpiryDate },
      { type: "hosting", date: blog.hostingExpiryDate },
      { type: "ssl", date: blog.sslExpiryDate },
    ];

    for (const field of expiryFields) {
      if (!field.date) continue;

      const expiryDate = new Date(field.date);
      const daysUntil = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Find the appropriate threshold
      let alertLevel: "info" | "warning" | "urgent" | "overdue" | null = null;
      for (const threshold of RENEWAL_THRESHOLDS) {
        if (daysUntil <= threshold.days) {
          alertLevel = threshold.level;
        }
      }

      if (alertLevel) {
        // Check if an active alert already exists for this blog/type
        const existing = await db.select().from(renewalAlerts)
          .where(and(
            eq(renewalAlerts.blogId, blog.id),
            eq(renewalAlerts.renewalType, field.type),
            eq(renewalAlerts.renewed, false),
          ))
          .limit(1);

        if (existing.length === 0) {
          alertsToCreate.push({
            blogId: blog.id,
            clientId: blog.clientId,
            renewalType: field.type,
            expiryDate: field.date,
            daysUntilExpiry: daysUntil,
            alertLevel,
          });
        } else {
          // Update existing alert level if it has escalated
          await db.update(renewalAlerts).set({
            daysUntilExpiry: daysUntil,
            alertLevel,
          }).where(eq(renewalAlerts.id, existing[0].id));
        }
      }
    }
  }

  // Bulk insert new alerts
  if (alertsToCreate.length > 0) {
    await db.insert(renewalAlerts).values(alertsToCreate);
  }

  return { scanned: activeBlogs.length, newAlerts: alertsToCreate.length };
}
