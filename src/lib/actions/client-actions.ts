"use server";

import { db } from "@/lib/db";
import {
  clients,
  blogs,
  seoScans,
  invoices,
  messages,
  activityLog,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  createClientSchema,
  updateClientSchema,
} from "@/lib/validators/client";
import {
  eq,
  and,
  like,
  desc,
  count,
  avg,
  sql,
  or,
} from "drizzle-orm";
import type { CreateClientInput, UpdateClientInput } from "@/lib/validators/client";

// ─── getClients ─────────────────────────────────────────────────────────────

export async function getClients(
  search?: string,
  status?: string,
  page: number = 1,
  pageSize: number = 20
) {
  await requireAdmin();

  const conditions = [];

  if (search && search.trim() !== "") {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        like(clients.name, term),
        like(clients.contactEmail, term)
      )
    );
  }

  if (status && status !== "all") {
    conditions.push(
      eq(clients.status, status as "onboarding" | "active" | "paused" | "churned")
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [clientRows, totalResult] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(whereClause)
      .orderBy(desc(clients.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(clients)
      .where(whereClause),
  ]);

  return {
    clients: clientRows,
    total: totalResult[0]?.total ?? 0,
    page,
    pageSize,
  };
}

// ─── getClient ──────────────────────────────────────────────────────────────

export async function getClient(id: string) {
  await requireAdmin();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);

  if (!client) {
    throw new Error("Client not found");
  }

  const [blogCountResult] = await db
    .select({ count: count() })
    .from(blogs)
    .where(eq(blogs.clientId, id));

  return {
    ...client,
    blogCount: blogCountResult?.count ?? 0,
  };
}

// ─── createClient ───────────────────────────────────────────────────────────

export async function createClient(data: CreateClientInput) {
  const session = await requireAdmin();

  const parsed = createClientSchema.parse(data);

  const [newClient] = await db
    .insert(clients)
    .values({
      name: parsed.name,
      contactName: parsed.contactName || null,
      contactEmail: parsed.contactEmail || null,
      contactPhone: parsed.contactPhone || null,
      niche: parsed.niche || null,
      totalBlogsTarget: parsed.totalBlogsTarget ?? 0,
      billingType: parsed.billingType ?? "monthly",
      billingAmount: parsed.billingAmount?.toString() ?? "0",
      setupFee: parsed.setupFee?.toString() ?? "0",
      setupFeePaid: parsed.setupFeePaid ?? false,
      billingStartDate: parsed.billingStartDate || null,
      nextBillingDate: parsed.nextBillingDate || null,
      billingStatus: parsed.billingStatus ?? "active",
      notesInternal: parsed.notesInternal || null,
      status: parsed.status ?? "onboarding",
    })
    .returning();

  // Log activity
  await db.insert(activityLog).values({
    userId: session.user.id,
    clientId: newClient.id,
    action: "client.created",
    entityType: "client",
    entityId: newClient.id,
    details: { name: newClient.name },
  });

  return newClient;
}

// ─── updateClient ───────────────────────────────────────────────────────────

export async function updateClient(id: string, data: UpdateClientInput) {
  const session = await requireAdmin();

  const parsed = updateClientSchema.parse(data);

  // Build update object, only including defined fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.contactName !== undefined) updateData.contactName = parsed.contactName || null;
  if (parsed.contactEmail !== undefined) updateData.contactEmail = parsed.contactEmail || null;
  if (parsed.contactPhone !== undefined) updateData.contactPhone = parsed.contactPhone || null;
  if (parsed.niche !== undefined) updateData.niche = parsed.niche || null;
  if (parsed.totalBlogsTarget !== undefined) updateData.totalBlogsTarget = parsed.totalBlogsTarget;
  if (parsed.billingType !== undefined) updateData.billingType = parsed.billingType;
  if (parsed.billingAmount !== undefined) updateData.billingAmount = parsed.billingAmount.toString();
  if (parsed.setupFee !== undefined) updateData.setupFee = parsed.setupFee.toString();
  if (parsed.setupFeePaid !== undefined) updateData.setupFeePaid = parsed.setupFeePaid;
  if (parsed.billingStartDate !== undefined) updateData.billingStartDate = parsed.billingStartDate || null;
  if (parsed.nextBillingDate !== undefined) updateData.nextBillingDate = parsed.nextBillingDate || null;
  if (parsed.billingStatus !== undefined) updateData.billingStatus = parsed.billingStatus;
  if (parsed.notesInternal !== undefined) updateData.notesInternal = parsed.notesInternal || null;
  if (parsed.status !== undefined) updateData.status = parsed.status;

  const [updatedClient] = await db
    .update(clients)
    .set(updateData)
    .where(eq(clients.id, id))
    .returning();

  if (!updatedClient) {
    throw new Error("Client not found");
  }

  // Log activity
  await db.insert(activityLog).values({
    userId: session.user.id,
    clientId: id,
    action: "client.updated",
    entityType: "client",
    entityId: id,
    details: { updatedFields: Object.keys(parsed).filter((k) => parsed[k as keyof typeof parsed] !== undefined) },
  });

  return updatedClient;
}

// ─── deleteClient (soft delete) ─────────────────────────────────────────────

export async function deleteClient(id: string) {
  const session = await requireAdmin();

  const [updatedClient] = await db
    .update(clients)
    .set({ status: "churned", updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();

  if (!updatedClient) {
    throw new Error("Client not found");
  }

  // Log activity
  await db.insert(activityLog).values({
    userId: session.user.id,
    clientId: id,
    action: "client.deleted",
    entityType: "client",
    entityId: id,
    details: { name: updatedClient.name, softDelete: true },
  });

  return updatedClient;
}

// ─── getClientStats ─────────────────────────────────────────────────────────

export async function getClientStats(id: string) {
  await requireAdmin();

  const [blogStats] = await db
    .select({
      blogCount: count(),
    })
    .from(blogs)
    .where(eq(blogs.clientId, id));

  const [seoStats] = await db
    .select({
      avgScore: avg(seoScans.overallScore),
    })
    .from(seoScans)
    .where(eq(seoScans.clientId, id));

  const [invoiceStats] = await db
    .select({
      activeInvoices: count(),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.clientId, id),
        sql`${invoices.status} IN ('draft', 'sent')`
      )
    );

  const [messageStats] = await db
    .select({
      messageCount: count(),
    })
    .from(messages)
    .where(eq(messages.clientId, id));

  // Posts this month: count blog post verifications in current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [postsThisMonth] = await db
    .select({
      totalPosts: sql<number>`COALESCE(SUM(${sql.identifier("posts_in_period")}), 0)`,
    })
    .from(sql`post_verifications`)
    .where(
      sql`${sql.identifier("client_id")} = ${id} AND ${sql.identifier("checked_at")} >= ${startOfMonth.toISOString()}`
    );

  return {
    blogCount: blogStats?.blogCount ?? 0,
    avgSeoScore: seoStats?.avgScore ? Math.round(Number(seoStats.avgScore)) : null,
    activeInvoices: invoiceStats?.activeInvoices ?? 0,
    messageCount: messageStats?.messageCount ?? 0,
    postsThisMonth: postsThisMonth?.totalPosts ?? 0,
  };
}
