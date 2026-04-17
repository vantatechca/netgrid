"use server";

import { db } from "@/lib/db";
import { invoices, clients } from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte, lt } from "drizzle-orm";
import { requireAdmin, getClientScope } from "@/lib/auth/helpers";
import { logActivity } from "@/lib/services/activity-logger";
import { INVOICE_PREFIX } from "@/lib/constants";

export async function getInvoices(params?: {
  clientId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { clientId, status, page = 1, pageSize = 25 } = params || {};

  const conditions = [];
  const clientScope = await getClientScope();

  if (clientScope) {
    conditions.push(eq(invoices.clientId, clientScope));
    conditions.push(eq(invoices.visibleToClient, true));
  } else {
    if (clientId) conditions.push(eq(invoices.clientId, clientId));
  }
  if (status) conditions.push(eq(invoices.status, status as "draft" | "sent" | "paid" | "overdue" | "cancelled"));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [result, [{ total }]] = await Promise.all([
    db.select({
      invoice: invoices,
      clientName: clients.name,
    })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` })
      .from(invoices)
      .where(where),
  ]);

  return { invoices: result, total, page, pageSize };
}

export async function getInvoice(id: string) {
  const [invoice] = await db.select({
    invoice: invoices,
    clientName: clients.name,
    clientEmail: clients.contactEmail,
  })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.id, id))
    .limit(1);

  return invoice || null;
}

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [latest] = await db.select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${`${INVOICE_PREFIX}-${year}-%`}`)
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);

  let seq = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split("-");
    seq = parseInt(parts[2], 10) + 1;
  }

  return `${INVOICE_PREFIX}-${year}-${String(seq).padStart(4, "0")}`;
}

export async function createInvoice(data: {
  clientId: string;
  type: "setup" | "recurring" | "custom";
  amount: string;
  currency?: string;
  description?: string;
  dueDate: string;
}) {
  const session = await requireAdmin();

  const invoiceNumber = await generateInvoiceNumber();

  const [invoice] = await db.insert(invoices).values({
    clientId: data.clientId,
    invoiceNumber,
    type: data.type,
    amount: data.amount,
    currency: data.currency || "CAD",
    description: data.description,
    dueDate: data.dueDate,
    status: "draft",
    visibleToClient: false,
  }).returning();

  await logActivity({
    userId: session.user.id,
    clientId: data.clientId,
    action: "invoice_created",
    entityType: "invoice",
    entityId: invoice.id,
    details: { invoiceNumber, amount: data.amount },
  });

  return invoice;
}

export async function sendInvoice(invoiceId: string) {
  const session = await requireAdmin();

  await db.update(invoices).set({
    status: "sent",
    visibleToClient: true,
  }).where(eq(invoices.id, invoiceId));

  // TODO: Send email notification via Resend

  await logActivity({
    userId: session.user.id,
    action: "invoice_sent",
    entityType: "invoice",
    entityId: invoiceId,
  });
}

export async function markInvoicePaid(invoiceId: string, paidMethod: string) {
  const session = await requireAdmin();

  await db.update(invoices).set({
    status: "paid",
    paidAt: new Date(),
    paidMethod,
  }).where(eq(invoices.id, invoiceId));

  await logActivity({
    userId: session.user.id,
    action: "invoice_paid",
    entityType: "invoice",
    entityId: invoiceId,
    details: { paidMethod },
  });
}

export async function cancelInvoice(invoiceId: string) {
  const session = await requireAdmin();

  await db.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, invoiceId));

  await logActivity({
    userId: session.user.id,
    action: "invoice_cancelled",
    entityType: "invoice",
    entityId: invoiceId,
  });
}

export async function getRevenueStats() {
  await requireAdmin();

  const [mrr] = await db.select({
    total: sql<number>`coalesce(sum(${clients.billingAmount}::numeric), 0)::numeric`,
  })
    .from(clients)
    .where(and(eq(clients.billingType, "monthly"), eq(clients.billingStatus, "active")));

  const [arr] = await db.select({
    total: sql<number>`coalesce(sum(${clients.billingAmount}::numeric), 0)::numeric`,
  })
    .from(clients)
    .where(and(eq(clients.billingType, "yearly"), eq(clients.billingStatus, "active")));

  const [overdue] = await db.select({
    total: sql<number>`coalesce(sum(${invoices.amount}::numeric), 0)::numeric`,
    count: sql<number>`count(*)::int`,
  })
    .from(invoices)
    .where(eq(invoices.status, "overdue"));

  const [upcoming] = await db.select({
    total: sql<number>`coalesce(sum(${invoices.amount}::numeric), 0)::numeric`,
    count: sql<number>`count(*)::int`,
  })
    .from(invoices)
    .where(and(
      eq(invoices.status, "sent"),
      gte(invoices.dueDate, new Date().toISOString().split("T")[0]),
      lte(invoices.dueDate, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
    ));

  return {
    mrr: Number(mrr?.total || 0),
    arr: Number(mrr?.total || 0) * 12 + Number(arr?.total || 0),
    overdueTotal: Number(overdue?.total || 0),
    overdueCount: overdue?.count || 0,
    upcomingTotal: Number(upcoming?.total || 0),
    upcomingCount: upcoming?.count || 0,
  };
}

// Called by cron job
export async function runInvoiceRemindersCron() {
  const today = new Date().toISOString().split("T")[0];

  // Find overdue invoices that are "sent" but past due date
  const overdueInvoices = await db.select()
    .from(invoices)
    .where(and(
      eq(invoices.status, "sent"),
      lt(invoices.dueDate, today),
    ));

  for (const invoice of overdueInvoices) {
    await db.update(invoices).set({ status: "overdue" }).where(eq(invoices.id, invoice.id));
  }

  // Send reminders for overdue invoices
  const toRemind = await db.select({
    invoice: invoices,
    clientEmail: clients.contactEmail,
    clientName: clients.name,
  })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.status, "overdue"));

  let remindersSent = 0;
  for (const { invoice: inv } of toRemind) {
    // Check reminder schedule (1, 7, 14, 30 days)
    const dueDate = new Date(inv.dueDate);
    const daysOverdue = Math.ceil((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const shouldRemind = [1, 7, 14, 30].includes(daysOverdue) || (daysOverdue > 30 && daysOverdue % 7 === 0);

    if (shouldRemind) {
      // TODO: Send reminder email via Resend
      await db.update(invoices).set({
        reminderSentAt: new Date(),
        remindersCount: (inv.remindersCount || 0) + 1,
      }).where(eq(invoices.id, inv.id));
      remindersSent++;
    }
  }

  return { overdueMarked: overdueInvoices.length, remindersSent };
}
