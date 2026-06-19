"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, blogs, clients, knowledgeDocuments } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { convertToMarkdown } from "@/lib/services/knowledge-converter";
import { extractKnowledge } from "@/lib/services/knowledge-extractor";

// Hard ceiling on upload size — large enough for briefs/sheets/PDFs, small
// enough to keep conversion and storage sane.
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

// ─── Types ──────────────────────────────────────────────────────────────────

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;

/** Aggregated knowledge for a blog — consumed by ideation/generation. */
export interface BlogKnowledge {
  keywords: string[];
  topics: string[];
  summaries: string[];
}

// ─── uploadKnowledgeDocument ──────────────────────────────────────────────────

/**
 * Accept an uploaded client document: normalise it to Markdown, store it, then
 * run the one-time extraction pass. Extraction failure is non-fatal — the
 * document is always stored so the raw Markdown is never lost.
 *
 * FormData fields: `file` (required), `clientId` (required), `blogId`
 * (optional — omit/empty for a client-wide document), `niche` (optional hint).
 */
export async function uploadKnowledgeDocument(
  formData: FormData,
): Promise<KnowledgeDocument> {
  const session = await requireAdmin();

  const file = formData.get("file");
  const clientId = String(formData.get("clientId") ?? "").trim();
  const blogIdRaw = String(formData.get("blogId") ?? "").trim();
  const blogId = blogIdRaw.length > 0 ? blogIdRaw : null;
  const niche = String(formData.get("niche") ?? "").trim() || undefined;

  if (!(file instanceof File)) {
    throw new Error("No file provided.");
  }
  if (!clientId) {
    throw new Error("clientId is required.");
  }
  if (file.size === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const conversion = await convertToMarkdown(
    buf,
    file.type || "",
    file.name,
  );

  // 1. Store the document immediately (extraction pending) so the Markdown is
  //    persisted even if the extraction call later fails.
  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({
      clientId,
      blogId,
      fileName: file.name,
      contentType: file.type || null,
      sourceType: conversion.sourceType,
      markdown: conversion.markdown,
      charCount: conversion.charCount,
      lowConfidence: conversion.lowConfidence,
      warnings: conversion.warnings.length > 0 ? conversion.warnings : null,
      extractionStatus: "pending",
      uploadedBy: session.user.id,
    })
    .returning();

  // 2. Extraction pass — best-effort. On failure, keep the document and record
  //    the error rather than throwing away the upload.
  let final = doc;
  try {
    const extraction = await extractKnowledge(conversion.markdown, {
      fileName: file.name,
      niche,
    });
    [final] = await db
      .update(knowledgeDocuments)
      .set({
        extractedKeywords: extraction.keywords,
        extractedTopics: extraction.topics,
        summary: extraction.summary || null,
        extractionStatus: "extracted",
        extractionError: null,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, doc.id))
      .returning();
  } catch (err) {
    [final] = await db
      .update(knowledgeDocuments)
      .set({
        extractionStatus: "failed",
        extractionError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, doc.id))
      .returning();
  }

  await db.insert(activityLog).values({
    userId: session.user.id,
    clientId,
    action: "knowledge.uploaded",
    entityType: "knowledge_document",
    entityId: doc.id,
    details: {
      fileName: file.name,
      sourceType: conversion.sourceType,
      blogId,
      extractionStatus: final.extractionStatus,
      lowConfidence: conversion.lowConfidence,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return final;
}

// ─── listKnowledgeDocuments ───────────────────────────────────────────────────

/**
 * List a client's knowledge documents (newest first). The heavy `markdown`
 * column is omitted — callers that need the body fetch a single row.
 */
export async function listKnowledgeDocuments(clientId: string) {
  await requireAdmin();

  return db
    .select({
      id: knowledgeDocuments.id,
      clientId: knowledgeDocuments.clientId,
      blogId: knowledgeDocuments.blogId,
      fileName: knowledgeDocuments.fileName,
      contentType: knowledgeDocuments.contentType,
      sourceType: knowledgeDocuments.sourceType,
      charCount: knowledgeDocuments.charCount,
      lowConfidence: knowledgeDocuments.lowConfidence,
      warnings: knowledgeDocuments.warnings,
      extractedKeywords: knowledgeDocuments.extractedKeywords,
      extractedTopics: knowledgeDocuments.extractedTopics,
      summary: knowledgeDocuments.summary,
      extractionStatus: knowledgeDocuments.extractionStatus,
      extractionError: knowledgeDocuments.extractionError,
      isActive: knowledgeDocuments.isActive,
      createdAt: knowledgeDocuments.createdAt,
      updatedAt: knowledgeDocuments.updatedAt,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.clientId, clientId))
    .orderBy(desc(knowledgeDocuments.createdAt));
}

// ─── setKnowledgeDocumentActive ───────────────────────────────────────────────

/** Toggle whether a document is consulted during ideation/generation. */
export async function setKnowledgeDocumentActive(id: string, isActive: boolean) {
  await requireAdmin();

  const [updated] = await db
    .update(knowledgeDocuments)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(knowledgeDocuments.id, id))
    .returning();

  if (!updated) throw new Error("Knowledge document not found.");

  revalidatePath(`/clients/${updated.clientId}`);
  return updated;
}

// ─── deleteKnowledgeDocument ──────────────────────────────────────────────────

export async function deleteKnowledgeDocument(id: string) {
  const session = await requireAdmin();

  const [deleted] = await db
    .delete(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id))
    .returning();

  if (!deleted) throw new Error("Knowledge document not found.");

  await db.insert(activityLog).values({
    userId: session.user.id,
    clientId: deleted.clientId,
    action: "knowledge.deleted",
    entityType: "knowledge_document",
    entityId: id,
    details: { fileName: deleted.fileName },
  });

  revalidatePath(`/clients/${deleted.clientId}`);
  return deleted;
}

// ─── reprocessKnowledgeDocument ───────────────────────────────────────────────

/**
 * Re-run the extraction pass on an already-stored document's Markdown, without
 * re-uploading the file. For documents whose extraction failed or came back
 * low-confidence. Uses the client's niche to focus keyword choice.
 */
export async function reprocessKnowledgeDocument(
  id: string,
): Promise<KnowledgeDocument> {
  await requireAdmin();

  const [row] = await db
    .select({
      doc: knowledgeDocuments,
      niche: clients.niche,
    })
    .from(knowledgeDocuments)
    .innerJoin(clients, eq(knowledgeDocuments.clientId, clients.id))
    .where(eq(knowledgeDocuments.id, id))
    .limit(1);

  if (!row) throw new Error("Knowledge document not found.");

  try {
    const extraction = await extractKnowledge(row.doc.markdown, {
      fileName: row.doc.fileName,
      niche: row.niche ?? undefined,
    });
    const [updated] = await db
      .update(knowledgeDocuments)
      .set({
        extractedKeywords: extraction.keywords,
        extractedTopics: extraction.topics,
        summary: extraction.summary || null,
        extractionStatus: "extracted",
        extractionError: null,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, id))
      .returning();
    revalidatePath(`/clients/${row.doc.clientId}`);
    return updated;
  } catch (err) {
    const [updated] = await db
      .update(knowledgeDocuments)
      .set({
        extractionStatus: "failed",
        extractionError: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, id))
      .returning();
    revalidatePath(`/clients/${row.doc.clientId}`);
    return updated;
  }
}

// ─── getActiveKnowledgeForBlog ────────────────────────────────────────────────

/**
 * Aggregate the active knowledge that applies to a blog: every client-wide
 * document (blogId null) plus any scoped to this blog. This is the read seam
 * for the Phase 3 wire-in into ideation/generation.
 */
export async function getActiveKnowledgeForBlog(
  blogId: string,
): Promise<BlogKnowledge> {
  const [blog] = await db
    .select({ clientId: blogs.clientId })
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!blog) return { keywords: [], topics: [], summaries: [] };

  const rows = await db
    .select({
      extractedKeywords: knowledgeDocuments.extractedKeywords,
      extractedTopics: knowledgeDocuments.extractedTopics,
      summary: knowledgeDocuments.summary,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.clientId, blog.clientId),
        eq(knowledgeDocuments.isActive, true),
        or(isNull(knowledgeDocuments.blogId), eq(knowledgeDocuments.blogId, blogId)),
      ),
    );

  const keywords = new Set<string>();
  const topics = new Set<string>();
  const summaries: string[] = [];

  for (const row of rows) {
    for (const k of (row.extractedKeywords as string[] | null) ?? []) keywords.add(k);
    for (const t of (row.extractedTopics as string[] | null) ?? []) topics.add(t);
    if (row.summary) summaries.push(row.summary);
  }

  return {
    keywords: Array.from(keywords),
    topics: Array.from(topics),
    summaries,
  };
}
