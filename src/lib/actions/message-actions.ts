"use server";

import { db } from "@/lib/db";
import { messages, users } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getSession, getClientScope } from "@/lib/auth/helpers";
import { logActivity } from "@/lib/services/activity-logger";

export async function getMessages(params?: {
  clientId?: string;
  page?: number;
  pageSize?: number;
}) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const { clientId, page = 1, pageSize = 50 } = params || {};

  const conditions = [];
  const clientScope = await getClientScope();

  if (clientScope) {
    // Client user: only see their messages, non-internal
    conditions.push(eq(messages.clientId, clientScope));
    conditions.push(eq(messages.isInternal, false));
  } else if (clientId) {
    conditions.push(eq(messages.clientId, clientId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const result = await db.select({
    message: messages,
    senderName: users.name,
    senderEmail: users.email,
  })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(where)
    .orderBy(desc(messages.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return result;
}

export async function sendMessage(data: {
  clientId: string;
  content: string;
  isInternal?: boolean;
  attachments?: unknown[];
}) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const isClient = session.user.role === "client";
  const senderRole = isClient ? "client" : "admin";

  const [message] = await db.insert(messages).values({
    clientId: data.clientId,
    senderId: session.user.id,
    senderRole: senderRole as "admin" | "client",
    content: data.content,
    isInternal: isClient ? false : (data.isInternal || false),
    attachments: data.attachments || null,
    readByClient: isClient,
    readByAdmin: !isClient,
  }).returning();

  // TODO: Send email notification via Resend

  await logActivity({
    userId: session.user.id,
    clientId: data.clientId,
    action: "message_sent",
    entityType: "message",
    entityId: message.id,
    details: { isInternal: data.isInternal },
  });

  return message;
}

export async function sendSystemMessage(clientId: string, content: string) {
  const [message] = await db.insert(messages).values({
    clientId,
    senderId: null,
    senderRole: "system",
    content,
    isInternal: false,
    readByClient: false,
    readByAdmin: true,
  }).returning();

  return message;
}

export async function markMessagesRead(clientId: string) {
  const session = await getSession();
  if (!session) return;

  const isClient = session.user.role === "client";

  if (isClient) {
    await db.update(messages).set({ readByClient: true })
      .where(and(eq(messages.clientId, clientId), eq(messages.readByClient, false)));
  } else {
    await db.update(messages).set({ readByAdmin: true })
      .where(and(eq(messages.clientId, clientId), eq(messages.readByAdmin, false)));
  }
}

export async function getUnreadCount(clientId?: string) {
  const session = await getSession();
  if (!session) return 0;

  const isClient = session.user.role === "client";
  const conditions = [];

  if (isClient) {
    conditions.push(eq(messages.clientId, session.user.clientId!));
    conditions.push(eq(messages.readByClient, false));
    conditions.push(eq(messages.isInternal, false));
  } else {
    conditions.push(eq(messages.readByAdmin, false));
    if (clientId) conditions.push(eq(messages.clientId, clientId));
  }

  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(...conditions));

  return result?.count || 0;
}
