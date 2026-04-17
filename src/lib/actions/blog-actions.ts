"use server";

import { db } from "@/lib/db";
import { blogs, clients } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { createBlogSchema, updateBlogSchema } from "@/lib/validators/blog";
import { testConnection } from "@/lib/services/wp-client";
import { parseBlogCsv } from "@/lib/services/csv-parser";
import { eq, and, like, sql, desc, asc, count } from "drizzle-orm";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { BlogStatus, WpConnectionResult, CsvImportResult } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GetBlogsParams {
  clientId?: string;
  search?: string;
  status?: BlogStatus;
  page?: number;
  pageSize?: number;
  sortBy?: "domain" | "status" | "createdAt" | "currentSeoScore";
  sortOrder?: "asc" | "desc";
}

interface GetBlogsResult {
  blogs: Array<{
    id: string;
    clientId: string;
    clientName: string;
    domain: string;
    wpUrl: string | null;
    seoPlugin: string | null;
    hostingProvider: string | null;
    registrar: string | null;
    domainExpiryDate: string | null;
    hostingExpiryDate: string | null;
    sslExpiryDate: string | null;
    postingFrequency: string | null;
    postingFrequencyDays: number | null;
    lastPostVerifiedAt: Date | null;
    lastPostTitle: string | null;
    currentSeoScore: number | null;
    lastSeoScanAt: Date | null;
    status: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Get Blogs (Paginated) ──────────────────────────────────────────────────

export async function getBlogs(params: GetBlogsParams = {}): Promise<GetBlogsResult> {
  await requireAdmin();

  const {
    clientId,
    search,
    status,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = params;

  // Build where conditions
  const conditions = [];

  if (clientId) {
    conditions.push(eq(blogs.clientId, clientId));
  }

  if (status) {
    conditions.push(eq(blogs.status, status));
  }

  if (search) {
    conditions.push(like(blogs.domain, `%${search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await db
    .select({ total: count() })
    .from(blogs)
    .where(whereClause);

  const totalCount = countResult?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const offset = (page - 1) * pageSize;

  // Sort mapping
  const sortColumnMap = {
    domain: blogs.domain,
    status: blogs.status,
    createdAt: blogs.createdAt,
    currentSeoScore: blogs.currentSeoScore,
  };
  const sortColumn = sortColumnMap[sortBy] || blogs.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  // Fetch blogs with client name
  const rows = await db
    .select({
      id: blogs.id,
      clientId: blogs.clientId,
      clientName: clients.name,
      domain: blogs.domain,
      wpUrl: blogs.wpUrl,
      seoPlugin: blogs.seoPlugin,
      hostingProvider: blogs.hostingProvider,
      registrar: blogs.registrar,
      domainExpiryDate: blogs.domainExpiryDate,
      hostingExpiryDate: blogs.hostingExpiryDate,
      sslExpiryDate: blogs.sslExpiryDate,
      postingFrequency: blogs.postingFrequency,
      postingFrequencyDays: blogs.postingFrequencyDays,
      lastPostVerifiedAt: blogs.lastPostVerifiedAt,
      lastPostTitle: blogs.lastPostTitle,
      currentSeoScore: blogs.currentSeoScore,
      lastSeoScanAt: blogs.lastSeoScanAt,
      status: blogs.status,
      createdAt: blogs.createdAt,
      updatedAt: blogs.updatedAt,
    })
    .from(blogs)
    .leftJoin(clients, eq(blogs.clientId, clients.id))
    .where(whereClause)
    .orderBy(orderFn(sortColumn))
    .limit(pageSize)
    .offset(offset);

  return {
    blogs: rows.map((r) => ({
      ...r,
      clientName: r.clientName ?? "Unknown Client",
    })),
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

// ─── Get Single Blog ────────────────────────────────────────────────────────

export async function getBlog(id: string) {
  await requireAdmin();

  const [row] = await db
    .select({
      id: blogs.id,
      clientId: blogs.clientId,
      clientName: clients.name,
      domain: blogs.domain,
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
      seoPlugin: blogs.seoPlugin,
      hostingProvider: blogs.hostingProvider,
      hostingLoginUrl: blogs.hostingLoginUrl,
      hostingUsername: blogs.hostingUsername,
      hostingPassword: blogs.hostingPassword,
      registrar: blogs.registrar,
      registrarLoginUrl: blogs.registrarLoginUrl,
      registrarUsername: blogs.registrarUsername,
      registrarPassword: blogs.registrarPassword,
      domainExpiryDate: blogs.domainExpiryDate,
      hostingExpiryDate: blogs.hostingExpiryDate,
      sslExpiryDate: blogs.sslExpiryDate,
      postingFrequency: blogs.postingFrequency,
      postingFrequencyDays: blogs.postingFrequencyDays,
      lastPostVerifiedAt: blogs.lastPostVerifiedAt,
      lastPostTitle: blogs.lastPostTitle,
      currentSeoScore: blogs.currentSeoScore,
      lastSeoScanAt: blogs.lastSeoScanAt,
      status: blogs.status,
      notesInternal: blogs.notesInternal,
      createdAt: blogs.createdAt,
      updatedAt: blogs.updatedAt,
    })
    .from(blogs)
    .leftJoin(clients, eq(blogs.clientId, clients.id))
    .where(eq(blogs.id, id));

  if (!row) {
    return { error: "Blog not found" };
  }

  return {
    ...row,
    clientName: row.clientName ?? "Unknown Client",
  };
}

// ─── Create Blog ────────────────────────────────────────────────────────────

export async function createBlog(data: unknown) {
  await requireAdmin();

  const parsed = createBlogSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Validation failed", details: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;

  // Check domain uniqueness
  const [existing] = await db
    .select({ id: blogs.id })
    .from(blogs)
    .where(eq(blogs.domain, input.domain));

  if (existing) {
    return { error: "A blog with this domain already exists" };
  }

  // Clean empty strings to null for optional fields
  const cleanValue = (v: string | undefined): string | null =>
    v && v.trim().length > 0 ? v.trim() : null;

  const [inserted] = await db
    .insert(blogs)
    .values({
      clientId: input.clientId,
      domain: input.domain,
      wpUrl: cleanValue(input.wpUrl),
      wpUsername: cleanValue(input.wpUsername),
      wpAppPassword: cleanValue(input.wpAppPassword),
      seoPlugin: input.seoPlugin,
      hostingProvider: cleanValue(input.hostingProvider),
      hostingLoginUrl: cleanValue(input.hostingLoginUrl),
      hostingUsername: cleanValue(input.hostingUsername),
      hostingPassword: cleanValue(input.hostingPassword),
      registrar: cleanValue(input.registrar),
      registrarLoginUrl: cleanValue(input.registrarLoginUrl),
      registrarUsername: cleanValue(input.registrarUsername),
      registrarPassword: cleanValue(input.registrarPassword),
      domainExpiryDate: cleanValue(input.domainExpiryDate),
      hostingExpiryDate: cleanValue(input.hostingExpiryDate),
      sslExpiryDate: cleanValue(input.sslExpiryDate),
      postingFrequency: cleanValue(input.postingFrequency),
      postingFrequencyDays: input.postingFrequencyDays ?? null,
      status: input.status,
      notesInternal: cleanValue(input.notesInternal),
    })
    .returning({ id: blogs.id });

  return { id: inserted.id };
}

// ─── Update Blog ────────────────────────────────────────────────────────────

export async function updateBlog(id: string, data: unknown) {
  await requireAdmin();

  const parsed = updateBlogSchema.safeParse(data);
  if (!parsed.success) {
    return { error: "Validation failed", details: parsed.error.flatten().fieldErrors };
  }

  const input = parsed.data;

  // Check blog exists
  const [existing] = await db
    .select({ id: blogs.id, domain: blogs.domain })
    .from(blogs)
    .where(eq(blogs.id, id));

  if (!existing) {
    return { error: "Blog not found" };
  }

  // If domain is changing, check uniqueness
  if (input.domain && input.domain !== existing.domain) {
    const [domainTaken] = await db
      .select({ id: blogs.id })
      .from(blogs)
      .where(and(eq(blogs.domain, input.domain), sql`${blogs.id} != ${id}`));

    if (domainTaken) {
      return { error: "A blog with this domain already exists" };
    }
  }

  const cleanValue = (v: string | undefined): string | null | undefined => {
    if (v === undefined) return undefined;
    return v.trim().length > 0 ? v.trim() : null;
  };

  // Build update object, only including defined fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (input.domain !== undefined) updateData.domain = input.domain;
  if (input.wpUrl !== undefined) updateData.wpUrl = cleanValue(input.wpUrl);
  if (input.wpUsername !== undefined) updateData.wpUsername = cleanValue(input.wpUsername);
  if (input.wpAppPassword !== undefined) updateData.wpAppPassword = cleanValue(input.wpAppPassword);
  if (input.seoPlugin !== undefined) updateData.seoPlugin = input.seoPlugin;
  if (input.hostingProvider !== undefined) updateData.hostingProvider = cleanValue(input.hostingProvider);
  if (input.hostingLoginUrl !== undefined) updateData.hostingLoginUrl = cleanValue(input.hostingLoginUrl);
  if (input.hostingUsername !== undefined) updateData.hostingUsername = cleanValue(input.hostingUsername);
  if (input.hostingPassword !== undefined) updateData.hostingPassword = cleanValue(input.hostingPassword);
  if (input.registrar !== undefined) updateData.registrar = cleanValue(input.registrar);
  if (input.registrarLoginUrl !== undefined) updateData.registrarLoginUrl = cleanValue(input.registrarLoginUrl);
  if (input.registrarUsername !== undefined) updateData.registrarUsername = cleanValue(input.registrarUsername);
  if (input.registrarPassword !== undefined) updateData.registrarPassword = cleanValue(input.registrarPassword);
  if (input.domainExpiryDate !== undefined) updateData.domainExpiryDate = cleanValue(input.domainExpiryDate);
  if (input.hostingExpiryDate !== undefined) updateData.hostingExpiryDate = cleanValue(input.hostingExpiryDate);
  if (input.sslExpiryDate !== undefined) updateData.sslExpiryDate = cleanValue(input.sslExpiryDate);
  if (input.postingFrequency !== undefined) updateData.postingFrequency = cleanValue(input.postingFrequency);
  if (input.postingFrequencyDays !== undefined) updateData.postingFrequencyDays = input.postingFrequencyDays ?? null;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.notesInternal !== undefined) updateData.notesInternal = cleanValue(input.notesInternal);

  await db.update(blogs).set(updateData).where(eq(blogs.id, id));

  return { success: true };
}

// ─── Delete Blog (Soft) ─────────────────────────────────────────────────────

export async function deleteBlog(id: string) {
  await requireAdmin();

  const [existing] = await db
    .select({ id: blogs.id })
    .from(blogs)
    .where(eq(blogs.id, id));

  if (!existing) {
    return { error: "Blog not found" };
  }

  await db
    .update(blogs)
    .set({ status: "decommissioned", updatedAt: new Date() })
    .where(eq(blogs.id, id));

  return { success: true };
}

// ─── Test Blog Connection ───────────────────────────────────────────────────

export async function testBlogConnection(id: string): Promise<WpConnectionResult> {
  await requireAdmin();

  const [blog] = await db
    .select({
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
    })
    .from(blogs)
    .where(eq(blogs.id, id));

  if (!blog) {
    return { success: false, message: "Blog not found" };
  }

  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { success: false, message: "WordPress credentials are incomplete" };
  }

  const result = await testConnection(blog.wpUrl, blog.wpUsername, blog.wpAppPassword);

  // Update blog record with detected info
  if (result.success) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (result.seoPlugin) {
      updateData.seoPlugin = result.seoPlugin;
    }
    await db.update(blogs).set(updateData).where(eq(blogs.id, id));
  }

  return result;
}

// ─── Import Blogs from CSV ──────────────────────────────────────────────────

export async function importBlogsFromCsv(
  clientId: string,
  csvContent: string
): Promise<CsvImportResult> {
  await requireAdmin();

  const { valid, errors: parseErrors } = parseBlogCsv(csvContent, clientId);

  const result: CsvImportResult = {
    totalRows: valid.length + parseErrors.length,
    successCount: 0,
    failedCount: parseErrors.length,
    errors: parseErrors.map((e) => ({ row: e.row, field: e.field, message: e.message })),
  };

  if (valid.length === 0) {
    return result;
  }

  // Insert valid rows one-by-one to handle individual failures
  for (let i = 0; i < valid.length; i++) {
    const row = valid[i];
    try {
      // Check domain uniqueness
      const [existing] = await db
        .select({ id: blogs.id })
        .from(blogs)
        .where(eq(blogs.domain, row.domain));

      if (existing) {
        result.failedCount++;
        result.errors.push({
          row: i + 2, // 1-based + header
          field: "domain",
          message: `Domain already exists: ${row.domain}`,
        });
        continue;
      }

      await db.insert(blogs).values({
        clientId: row.clientId,
        domain: row.domain,
        wpUrl: row.wpUrl,
        wpUsername: row.wpUsername,
        wpAppPassword: row.wpAppPassword,
        seoPlugin: row.seoPlugin,
        hostingProvider: row.hostingProvider,
        registrar: row.registrar,
        domainExpiryDate: row.domainExpiryDate,
        hostingExpiryDate: row.hostingExpiryDate,
        postingFrequency: row.postingFrequency,
        status: "setup",
      });

      result.successCount++;
    } catch (error) {
      result.failedCount++;
      result.errors.push({
        row: i + 2,
        field: "insert",
        message: error instanceof Error ? error.message : "Database insert failed",
      });
    }
  }

  result.totalRows = result.successCount + result.failedCount;

  return result;
}

// ─── Get All Clients (for selectors) ────────────────────────────────────────

export async function getClientsForSelect() {
  await requireAdmin();

  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(asc(clients.name));

  return rows;
}
