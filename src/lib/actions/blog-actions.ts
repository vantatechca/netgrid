"use server";

import { db } from "@/lib/db";
import { blogs, clients, generatedPosts } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { createBlogSchema, updateBlogSchema } from "@/lib/validators/blog";
import { testConnection as platformTestConnection } from "@/lib/services/platform-client";
import {
  testConnection as shopifyTestConnection,
  fetchAllLiveArticles as shopifyFetchAllLive,
  type ShopifyCreds,
} from "@/lib/services/shopify-client";
import {
  generateContent,
  ideateTopic,
  type GenerateOptions,
  type Tone,
} from "@/lib/services/content-generator";
import { parseBlogCsv } from "@/lib/services/csv-parser";
import {
  assignProfileForBlogIfPeptides,
  getStyleProfileForBlog,
} from "@/lib/actions/style-profile-actions";

/**
 * Load the blog's style profile, lazily assigning one if the blog is a
 * peptide blog created before the style-profile system landed. This makes
 * the architecture work for existing blogs without a manual backfill step.
 *
 * Returns null only when the blog isn't peptide-niche or assignment fails.
 */
async function loadOrAssignStyleProfile(blogId: string) {
  let profile = await getStyleProfileForBlog(blogId);
  if (profile) return profile;

  const result = await assignProfileForBlogIfPeptides(blogId);
  if (result.success && result.assigned) {
    // Re-fetch to get the persisted row (assignment writes to DB; we want
    // the in-memory shape with all field types resolved).
    profile = await getStyleProfileForBlog(blogId);
  }
  return profile;
}
import { eq, and, like, sql, desc, asc, count, inArray } from "drizzle-orm";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type {
  BlogStatus,
  WpConnectionResult,
  CsvImportResult,
  PublishPostInput,
  PublishPostResult,
} from "@/lib/types";
import { publishPost as platformPublishPost } from "@/lib/services/platform-client";
import * as wp from "@/lib/services/wp-client";
import { revalidatePath } from "next/cache";

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
    platform: string;
    wpUrl: string | null;
    seoPlugin: string | null;
    shopifyStoreUrl: string | null;
    hostingProvider: string | null;
    registrar: string | null;
    postingFrequency: string | null;
    postingFrequencyDays: number[] | null;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

const cleanValue = (v: string | undefined | null): string | null =>
  v && v.trim().length > 0 ? v.trim() : null;

const cleanValueOrUndefined = (
  v: string | undefined | null,
): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return v.trim().length > 0 ? v.trim() : null;
};

// Normalize a posting-days value into a clean int[] (1-7, deduped, sorted)
// or null when the user clears the schedule.
const cleanPostingDays = (
  v: number[] | null | undefined,
): number[] | null => {
  if (!v || v.length === 0) return null;
  const cleaned = Array.from(
    new Set(v.filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)),
  ).sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : null;
};

// Postgres unique-violation
const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

// ─── Get Blogs (Paginated) ──────────────────────────────────────────────────

export async function getBlogs(
  params: GetBlogsParams = {},
): Promise<GetBlogsResult> {
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

  const conditions = [];

  if (clientId) conditions.push(eq(blogs.clientId, clientId));
  if (status) conditions.push(eq(blogs.status, status));
  if (search) conditions.push(like(blogs.domain, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ total: count() })
    .from(blogs)
    .where(whereClause);

  const totalCount = countResult?.total ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const offset = (page - 1) * pageSize;

  const sortColumnMap = {
    domain: blogs.domain,
    status: blogs.status,
    createdAt: blogs.createdAt,
    currentSeoScore: blogs.currentSeoScore,
  };
  const sortColumn = sortColumnMap[sortBy] || blogs.createdAt;
  const orderFn = sortOrder === "asc" ? asc : desc;

  const rows = await db
    .select({
      id: blogs.id,
      clientId: blogs.clientId,
      clientName: clients.name,
      domain: blogs.domain,
      platform: blogs.platform,
      wpUrl: blogs.wpUrl,
      seoPlugin: blogs.seoPlugin,
      shopifyStoreUrl: blogs.shopifyStoreUrl,
      hostingProvider: blogs.hostingProvider,
      registrar: blogs.registrar,
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
      platform: blogs.platform,
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
      seoPlugin: blogs.seoPlugin,
      shopifyAuthMode: blogs.shopifyAuthMode,
      shopifyStoreUrl: blogs.shopifyStoreUrl,
      shopifyAdminApiToken: blogs.shopifyAdminApiToken,
      shopifyClientId: blogs.shopifyClientId,
      shopifyClientSecret: blogs.shopifyClientSecret,
      shopifyApiVersion: blogs.shopifyApiVersion,
      shopifyBlogId: blogs.shopifyBlogId,
      shopifyBlogHandle: blogs.shopifyBlogHandle,
      shopifyGrantedScopes: blogs.shopifyGrantedScopes,
      hostingProvider: blogs.hostingProvider,
      hostingLoginUrl: blogs.hostingLoginUrl,
      hostingUsername: blogs.hostingUsername,
      hostingPassword: blogs.hostingPassword,
      registrar: blogs.registrar,
      registrarLoginUrl: blogs.registrarLoginUrl,
      registrarUsername: blogs.registrarUsername,
      registrarPassword: blogs.registrarPassword,
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
    return {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const input = parsed.data;

  try {
    const [inserted] = await db
      .insert(blogs)
      .values({
        clientId: input.clientId,
        domain: input.domain.trim().toLowerCase(),
        platform: input.platform ?? "wordpress",
        wpUrl: cleanValue(input.wpUrl),
        wpUsername: cleanValue(input.wpUsername),
        wpAppPassword: cleanValue(input.wpAppPassword),
        seoPlugin: input.seoPlugin,
        shopifyAuthMode: input.shopifyAuthMode ?? "client_credentials",
        shopifyStoreUrl: cleanValue(input.shopifyStoreUrl),
        shopifyAdminApiToken: cleanValue(input.shopifyAdminApiToken),
        shopifyClientId: cleanValue(input.shopifyClientId),
        shopifyClientSecret: cleanValue(input.shopifyClientSecret),
        shopifyApiVersion: cleanValue(input.shopifyApiVersion) ?? "2024-07",
        shopifyBlogId: cleanValue(input.shopifyBlogId),
        hostingProvider: cleanValue(input.hostingProvider),
        hostingLoginUrl: cleanValue(input.hostingLoginUrl),
        hostingUsername: cleanValue(input.hostingUsername),
        hostingPassword: cleanValue(input.hostingPassword),
        registrar: cleanValue(input.registrar),
        registrarLoginUrl: cleanValue(input.registrarLoginUrl),
        registrarUsername: cleanValue(input.registrarUsername),
        registrarPassword: cleanValue(input.registrarPassword),
        // Frequency is now always "weekly" — fall back if the form omits it.
        postingFrequency: cleanValue(input.postingFrequency) ?? "weekly",
        postingFrequencyDays: cleanPostingDays(input.postingFrequencyDays),
        status: input.status,
        notesInternal: cleanValue(input.notesInternal),
      })
      .returning({ id: blogs.id });

    // Style-profile assignment runs only for peptide-niche clients and is
    // non-blocking — a failure here doesn't roll back the blog insert. Admin
    // can retry via the reassign action if needed.
    try {
      const profileResult = await assignProfileForBlogIfPeptides(inserted.id);
      if (!profileResult.success && profileResult.message) {
        console.warn(
          `Style profile assignment skipped for blog ${inserted.id}: ${profileResult.message}`,
        );
      }
    } catch (profileErr) {
      console.error("Style profile assignment threw:", profileErr);
    }

    revalidatePath("/blogs");
    return { id: inserted.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "A blog with this domain already exists" };
    }
    console.error("createBlog failed:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to create blog",
    };
  }
}

// ─── Update Blog ────────────────────────────────────────────────────────────

export async function updateBlog(id: string, data: unknown) {
  await requireAdmin();

  const parsed = updateBlogSchema.safeParse(data);
  if (!parsed.success) {
    return {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const input = parsed.data;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (input.domain !== undefined)
    updateData.domain = input.domain.trim().toLowerCase();
  if (input.platform !== undefined) updateData.platform = input.platform;
  if (input.wpUrl !== undefined)
    updateData.wpUrl = cleanValueOrUndefined(input.wpUrl);
  if (input.wpUsername !== undefined)
    updateData.wpUsername = cleanValueOrUndefined(input.wpUsername);
  if (input.wpAppPassword !== undefined)
    updateData.wpAppPassword = cleanValueOrUndefined(input.wpAppPassword);
  if (input.seoPlugin !== undefined) updateData.seoPlugin = input.seoPlugin;
  if (input.shopifyAuthMode !== undefined)
    updateData.shopifyAuthMode = input.shopifyAuthMode;
  if (input.shopifyStoreUrl !== undefined)
    updateData.shopifyStoreUrl = cleanValueOrUndefined(input.shopifyStoreUrl);
  if (input.shopifyAdminApiToken !== undefined)
    updateData.shopifyAdminApiToken = cleanValueOrUndefined(
      input.shopifyAdminApiToken,
    );
  if (input.shopifyClientId !== undefined)
    updateData.shopifyClientId = cleanValueOrUndefined(input.shopifyClientId);
  if (input.shopifyClientSecret !== undefined)
    updateData.shopifyClientSecret = cleanValueOrUndefined(
      input.shopifyClientSecret,
    );
  if (input.shopifyApiVersion !== undefined)
    updateData.shopifyApiVersion = cleanValueOrUndefined(
      input.shopifyApiVersion,
    );
  if (input.shopifyBlogId !== undefined)
    updateData.shopifyBlogId = cleanValueOrUndefined(input.shopifyBlogId);
  if (input.hostingProvider !== undefined)
    updateData.hostingProvider = cleanValueOrUndefined(input.hostingProvider);
  if (input.hostingLoginUrl !== undefined)
    updateData.hostingLoginUrl = cleanValueOrUndefined(input.hostingLoginUrl);
  if (input.hostingUsername !== undefined)
    updateData.hostingUsername = cleanValueOrUndefined(input.hostingUsername);
  if (input.hostingPassword !== undefined)
    updateData.hostingPassword = cleanValueOrUndefined(input.hostingPassword);
  if (input.registrar !== undefined)
    updateData.registrar = cleanValueOrUndefined(input.registrar);
  if (input.registrarLoginUrl !== undefined)
    updateData.registrarLoginUrl = cleanValueOrUndefined(
      input.registrarLoginUrl,
    );
  if (input.registrarUsername !== undefined)
    updateData.registrarUsername = cleanValueOrUndefined(
      input.registrarUsername,
    );
  if (input.registrarPassword !== undefined)
    updateData.registrarPassword = cleanValueOrUndefined(
      input.registrarPassword,
    );
  if (input.postingFrequency !== undefined)
    updateData.postingFrequency = cleanValueOrUndefined(input.postingFrequency);
  if (input.postingFrequencyDays !== undefined)
    updateData.postingFrequencyDays = cleanPostingDays(
      input.postingFrequencyDays,
    );
  if (input.status !== undefined) updateData.status = input.status;
  if (input.notesInternal !== undefined)
    updateData.notesInternal = cleanValueOrUndefined(input.notesInternal);

  try {
    const result = await db
      .update(blogs)
      .set(updateData)
      .where(eq(blogs.id, id))
      .returning({ id: blogs.id });

    if (result.length === 0) {
      return { error: "Blog not found" };
    }

    revalidatePath("/blogs");
    revalidatePath(`/blogs/${id}`);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "A blog with this domain already exists" };
    }
    console.error("updateBlog failed:", err);
    return {
      error: err instanceof Error ? err.message : "Failed to update blog",
    };
  }
}

// ─── Delete Blog (Soft) ─────────────────────────────────────────────────────

export async function deleteBlog(id: string) {
  await requireAdmin();

  const result = await db
    .update(blogs)
    .set({ status: "decommissioned", updatedAt: new Date() })
    .where(eq(blogs.id, id))
    .returning({ id: blogs.id });

  if (result.length === 0) {
    return { error: "Blog not found" };
  }

  revalidatePath("/blogs");
  return { success: true };
}

// ─── Test Blog Connection (saved blog) ──────────────────────────────────────

export async function testBlogConnection(
  id: string,
): Promise<WpConnectionResult> {
  await requireAdmin();

  const [blog] = await db
    .select({
      platform: blogs.platform,
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
      shopifyAuthMode: blogs.shopifyAuthMode,
      shopifyStoreUrl: blogs.shopifyStoreUrl,
      shopifyAdminApiToken: blogs.shopifyAdminApiToken,
      shopifyClientId: blogs.shopifyClientId,
      shopifyClientSecret: blogs.shopifyClientSecret,
      shopifyApiVersion: blogs.shopifyApiVersion,
      shopifyBlogId: blogs.shopifyBlogId,
      shopifyBlogHandle: blogs.shopifyBlogHandle,
    })
    .from(blogs)
    .where(eq(blogs.id, id));

  if (!blog) {
    return { success: false, message: "Blog not found" };
  }

  const result = await platformTestConnection(blog);

  if (result.success) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (result.seoPlugin) {
      updateData.seoPlugin = result.seoPlugin;
    }
    await db.update(blogs).set(updateData).where(eq(blogs.id, id));
  }

  return result;
}

// ─── Test Shopify Connection (pre-save, from form) ──────────────────────────

export interface TestShopifyInput {
  storeUrl: string;
  authMode: "legacy_token" | "client_credentials";
  adminToken?: string;
  clientId?: string;
  clientSecret?: string;
  apiVersion?: string;
}

export async function testShopifyConnection(input: TestShopifyInput) {
  await requireAdmin();

  if (!input.storeUrl) {
    return {
      success: false as const,
      platform: "shopify" as const,
      message: "Store URL is required",
    };
  }

  let creds: ShopifyCreds;

  if (input.authMode === "legacy_token") {
    if (!input.adminToken) {
      return {
        success: false as const,
        platform: "shopify" as const,
        message: "Admin API access token is required",
      };
    }
    creds = {
      mode: "legacy_token",
      storeUrl: input.storeUrl,
      adminToken: input.adminToken,
    };
  } else {
    if (!input.clientId || !input.clientSecret) {
      return {
        success: false as const,
        platform: "shopify" as const,
        message: "Client ID and Client Secret are required",
      };
    }
    creds = {
      mode: "client_credentials",
      storeUrl: input.storeUrl,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    };
  }

  return shopifyTestConnection(creds, input.apiVersion);
}

// ─── Publish a Post / Article (ad-hoc input from a saved blog) ──────────────

export async function publishBlogPost(
  id: string,
  input: PublishPostInput,
): Promise<PublishPostResult> {
  await requireAdmin();

  const [blog] = await db
    .select({
      domain: blogs.domain,
      platform: blogs.platform,
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
      shopifyAuthMode: blogs.shopifyAuthMode,
      shopifyStoreUrl: blogs.shopifyStoreUrl,
      shopifyAdminApiToken: blogs.shopifyAdminApiToken,
      shopifyClientId: blogs.shopifyClientId,
      shopifyClientSecret: blogs.shopifyClientSecret,
      shopifyApiVersion: blogs.shopifyApiVersion,
      shopifyBlogId: blogs.shopifyBlogId,
      shopifyBlogHandle: blogs.shopifyBlogHandle,
    })
    .from(blogs)
    .where(eq(blogs.id, id));

  if (!blog) {
    return { success: false, message: "Blog not found" };
  }

  const result = await platformPublishPost(blog, input);

  // After first successful Shopify publish, cache the resolved blog handle so
  // later publishes skip the listBlogs roundtrip.
  if (
    result.success &&
    blog.platform === "shopify" &&
    !blog.shopifyBlogHandle &&
    "blogHandle" in result &&
    typeof result.blogHandle === "string" &&
    result.blogHandle
  ) {
    try {
      await db
        .update(blogs)
        .set({
          shopifyBlogHandle: result.blogHandle,
          updatedAt: new Date(),
        })
        .where(eq(blogs.id, id));
    } catch (err) {
      // Cache miss is non-fatal — log and continue.
      console.warn("Failed to cache shopifyBlogHandle:", err);
    }
  }

  return result;
}

// ─── Generate a Blog Post (writes to generated_posts) ───────────────────────

export interface GeneratePostInput {
  blogId: string;
  topic?: string;          // if omitted, ideateTopic picks one based on niche + recent
  keywords?: string[];     // if omitted, derived from ideation or empty
  wordCount?: number;      // clamped 500-800 internally
  tone?: Tone;
  brandVoice?: string;
  targetAudience?: string;
  seoOptimized?: boolean;
  autoPublish?: boolean;   // if true, publishGeneratedPost runs immediately after
}

export type GenerateBlogPostResult =
  | {
      success: true;
      generatedPostId: string;
      publishResult?: PublishPostResult; // present when autoPublish was requested
    }
  | { success: false; message: string };

export async function generateBlogPost(
  input: GeneratePostInput,
): Promise<GenerateBlogPostResult> {
  await requireAdmin();

  // 1. Load blog + niche context
  const [blog] = await db
    .select({
      id: blogs.id,
      clientId: blogs.clientId,
      domain: blogs.domain,
      platform: blogs.platform,
      niche: clients.niche,
    })
    .from(blogs)
    .leftJoin(clients, eq(blogs.clientId, clients.id))
    .where(eq(blogs.id, input.blogId));

  if (!blog) {
    return { success: false, message: "Blog not found" };
  }

  // 2. Topic — explicit or ideated from recent titles
  let topic = input.topic?.trim() || "";
  let keywords = input.keywords ?? [];

  if (!topic) {
    const recent = await db
      .select({ title: generatedPosts.title })
      .from(generatedPosts)
      .where(eq(generatedPosts.blogId, input.blogId))
      .orderBy(desc(generatedPosts.createdAt))
      .limit(20);

    try {
      const idea = await ideateTopic(
        blog.niche,
        recent.map((r) => r.title).filter((t): t is string => !!t),
      );
      topic = idea.topic;
      if (keywords.length === 0) keywords = idea.keywords;
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof Error
            ? `Topic ideation failed: ${err.message}`
            : "Topic ideation failed",
      };
    }
  }

  if (!topic) {
    return { success: false, message: "No topic provided and ideation returned empty" };
  }

  // 3. Insert "generating" placeholder so the row appears in the UI immediately
  const [pending] = await db
    .insert(generatedPosts)
    .values({
      blogId: input.blogId,
      clientId: blog.clientId,
      topic,
      keywords,
      status: "generating",
      isAutoGenerated: false,
    })
    .returning({ id: generatedPosts.id });

  revalidatePath(`/blogs/${input.blogId}`);
  revalidatePath(`/blogs/${input.blogId}/posts`);

  // 4. Generate via Claude — peptide blogs use their locked style profile
  //    so the prompt is composed via skeleton + scrubber runs after.
  //    If the blog was created before the style-profile system landed and
  //    is a peptide blog, this lazily assigns one and reuses it for all
  //    future generations.
  const styleProfile = await loadOrAssignStyleProfile(input.blogId);
  if (styleProfile) {
    console.info(
      `[generateBlogPost] Using style profile for ${blog.domain}: ` +
        `voice V${styleProfile.voiceId}, skeleton S${styleProfile.skeletonId}, ` +
        `cadence ${styleProfile.cadenceId}, sub-niche ${styleProfile.subNicheId}, ` +
        `strictness=${styleProfile.scrubberStrictness}`,
    );
  } else {
    console.info(
      `[generateBlogPost] No style profile for ${blog.domain} (niche="${blog.niche ?? "none"}") — using legacy prompt path`,
    );
  }

  let result;
  try {
    const opts: GenerateOptions = {
      topic,
      keywords,
      wordCount: input.wordCount ?? 700,
      tone: input.tone ?? "professional",
      niche: blog.niche,
      brandVoice: input.brandVoice,
      targetAudience: input.targetAudience,
      seoOptimized: input.seoOptimized ?? true,
      styleProfile: styleProfile ?? undefined,
    };
    result = await generateContent(opts);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Content generation failed";
    await db
      .update(generatedPosts)
      .set({
        status: "failed",
        failureReason: message,
        updatedAt: new Date(),
      })
      .where(eq(generatedPosts.id, pending.id));

    revalidatePath(`/blogs/${input.blogId}/posts`);
    return { success: false, message };
  }

  // 5. Persist generated content (incl. scrubber report when present)
  await db
    .update(generatedPosts)
    .set({
      title: result.title,
      body: result.content,
      excerpt: result.excerpt,
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      featuredImageUrl: result.heroImageUrl ?? null,
      keywords: result.keywords,
      wordCount: result.wordCount,
      seoScore: result.seoScore,
      readabilityScore: result.readabilityScore,
      brandVoiceScore: result.brandVoiceScore,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd.toString(),
      status: "generated",
      scrubberReport: result.scrubberReport ?? null,
      flaggedForReview: result.flaggedForReview ?? false,
      generatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(generatedPosts.id, pending.id));

  revalidatePath(`/blogs/${input.blogId}/posts`);

  // 6. Optional immediate publish
  if (input.autoPublish) {
    const publishResult = await publishGeneratedPost(pending.id);
    return {
      success: true,
      generatedPostId: pending.id,
      publishResult,
    };
  }

  return { success: true, generatedPostId: pending.id };
}

// ─── Publish a Generated Post (from generated_posts table) ──────────────────

export async function publishGeneratedPost(
  generatedPostId: string,
): Promise<PublishPostResult> {
  await requireAdmin();

  const [post] = await db
    .select({
      id: generatedPosts.id,
      blogId: generatedPosts.blogId,
      title: generatedPosts.title,
      body: generatedPosts.body,
      excerpt: generatedPosts.excerpt,
      metaTitle: generatedPosts.metaTitle,
      metaDescription: generatedPosts.metaDescription,
      featuredImageUrl: generatedPosts.featuredImageUrl,
      keywords: generatedPosts.keywords,
      status: generatedPosts.status,
    })
    .from(generatedPosts)
    .where(eq(generatedPosts.id, generatedPostId));

  if (!post) {
    return { success: false, message: "Generated post not found" };
  }

  if (post.status === "published") {
    return { success: false, message: "Post is already published" };
  }

  if (post.status === "publishing") {
    return {
      success: false,
      message: "Post is already being published — try again in a moment",
    };
  }

  if (!post.title || !post.body) {
    await db
      .update(generatedPosts)
      .set({
        status: "failed",
        failureReason: "Missing title or body — cannot publish",
        updatedAt: new Date(),
      })
      .where(eq(generatedPosts.id, generatedPostId));
    return {
      success: false,
      message: "Generated post is missing title or body",
    };
  }

  // Mark as publishing so concurrent triggers don't double-publish.
  await db
    .update(generatedPosts)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(eq(generatedPosts.id, generatedPostId));

  // Convert keywords (jsonb) → string[] for tags
  let tags: string[] | undefined;
  if (Array.isArray(post.keywords)) {
    tags = post.keywords.filter(
      (k): k is string => typeof k === "string" && k.trim().length > 0,
    );
  }

  const input: PublishPostInput = {
    title: post.title,
    content: post.body,
    excerpt: post.excerpt ?? undefined,
    status: "publish",
    tags,
    featuredImageUrl: post.featuredImageUrl ?? undefined,
  };

  const result = await publishBlogPost(post.blogId, input);

  if (result.success) {
    await db
      .update(generatedPosts)
      .set({
        status: "published",
        externalPostId: result.postId ? String(result.postId) : null,
        externalPostUrl: result.postUrl ?? null,
        publishedAt: new Date(),
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(generatedPosts.id, generatedPostId));

    // Stamp last-post fields on the blog row so dashboards stay fresh.
    await db
      .update(blogs)
      .set({
        lastPostTitle: post.title,
        lastPostVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(blogs.id, post.blogId));

    revalidatePath(`/blogs/${post.blogId}`);
    revalidatePath("/blogs");
  } else {
    await db
      .update(generatedPosts)
      .set({
        status: "failed",
        failureReason: result.message,
        updatedAt: new Date(),
      })
      .where(eq(generatedPosts.id, generatedPostId));
  }

  return result;
}

// ─── Retry a Failed Generated Post ──────────────────────────────────────────

export async function retryGeneratedPost(
  generatedPostId: string,
): Promise<PublishPostResult> {
  await requireAdmin();

  // Reset status to "generated" so publishGeneratedPost will pick it up.
  await db
    .update(generatedPosts)
    .set({
      status: "generated",
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(generatedPosts.id, generatedPostId));

  return publishGeneratedPost(generatedPostId);
}

// ─── Import Blogs from CSV (batched) ────────────────────────────────────────

export async function importBlogsFromCsv(
  clientId: string,
  csvContent: string,
): Promise<CsvImportResult> {
  await requireAdmin();

  const { valid, errors: parseErrors } = parseBlogCsv(csvContent, clientId);

  const result: CsvImportResult = {
    totalRows: valid.length + parseErrors.length,
    successCount: 0,
    failedCount: parseErrors.length,
    errors: parseErrors.map((e) => ({
      row: e.row,
      field: e.field,
      message: e.message,
    })),
  };

  if (valid.length === 0) {
    return result;
  }

  // Normalize domains for comparison
  const normalized = valid.map((row, idx) => ({
    ...row,
    domain: row.domain.trim().toLowerCase(),
    _rowIndex: idx + 2, // +2 for header + 1-index
  }));

  // 1. Detect duplicates within the CSV itself
  const seenInCsv = new Map<string, number>();
  const dedupedRows: typeof normalized = [];
  for (const row of normalized) {
    const firstSeenAt = seenInCsv.get(row.domain);
    if (firstSeenAt !== undefined) {
      result.failedCount++;
      result.errors.push({
        row: row._rowIndex,
        field: "domain",
        message: `Duplicate domain in CSV (also on row ${firstSeenAt}): ${row.domain}`,
      });
      continue;
    }
    seenInCsv.set(row.domain, row._rowIndex);
    dedupedRows.push(row);
  }

  if (dedupedRows.length === 0) {
    result.totalRows = result.successCount + result.failedCount;
    return result;
  }

  // 2. One round trip to find existing domains
  const existing = await db
    .select({ domain: blogs.domain })
    .from(blogs)
    .where(
      inArray(
        blogs.domain,
        dedupedRows.map((r) => r.domain),
      ),
    );

  const existingSet = new Set(existing.map((r) => r.domain));

  const toInsert: typeof dedupedRows = [];
  for (const row of dedupedRows) {
    if (existingSet.has(row.domain)) {
      result.failedCount++;
      result.errors.push({
        row: row._rowIndex,
        field: "domain",
        message: `Domain already exists: ${row.domain}`,
      });
      continue;
    }
    toInsert.push(row);
  }

  // 3. Bulk insert in a single round trip (chunked to stay under param limits)
  if (toInsert.length > 0) {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
      const chunk = toInsert.slice(i, i + CHUNK_SIZE);
      try {
        const inserted = await db
          .insert(blogs)
          .values(
            chunk.map((row) => ({
              clientId: row.clientId,
              domain: row.domain,
              wpUrl: row.wpUrl,
              wpUsername: row.wpUsername,
              wpAppPassword: row.wpAppPassword,
              seoPlugin: row.seoPlugin,
              hostingProvider: row.hostingProvider,
              registrar: row.registrar,
              postingFrequency: row.postingFrequency,
              status: "setup" as const,
            })),
          )
          .returning({ id: blogs.id });

        result.successCount += inserted.length;
      } catch (err) {
        // Bulk insert failed — fall back to row-by-row for this chunk only,
        // so we can report which specific rows broke.
        console.error("Bulk insert chunk failed, falling back per-row:", err);
        for (const row of chunk) {
          try {
            await db.insert(blogs).values({
              clientId: row.clientId,
              domain: row.domain,
              wpUrl: row.wpUrl,
              wpUsername: row.wpUsername,
              wpAppPassword: row.wpAppPassword,
              seoPlugin: row.seoPlugin,
              hostingProvider: row.hostingProvider,
              registrar: row.registrar,
              postingFrequency: row.postingFrequency,
              status: "setup",
            });
            result.successCount++;
          } catch (rowErr) {
            result.failedCount++;
            result.errors.push({
              row: row._rowIndex,
              field: "insert",
              message:
                rowErr instanceof Error
                  ? rowErr.message
                  : "Database insert failed",
            });
          }
        }
      }
    }
  }

  result.totalRows = result.successCount + result.failedCount;

  if (result.successCount > 0) {
    revalidatePath("/blogs");
  }

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

// ─── Posts: live (WordPress REST) + generated (our DB) ──────────────────────

export interface BlogGeneratedPostRow {
  id: string;
  topic: string;
  title: string | null;
  status: string;
  wordCount: number | null;
  seoScore: number | null;
  featuredImageUrl: string | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  failureReason: string | null;
  isAutoGenerated: boolean | null;
  generatedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface BlogLivePostRow {
  id: number;
  title: string;
  excerpt: string;
  status: string;
  link: string;
  date: string;
  modified: string;
}

export interface BlogPostsResult {
  generated: BlogGeneratedPostRow[];
  live: {
    available: boolean;
    platform: string;
    posts: BlogLivePostRow[];
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    error?: string;
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getBlogPosts(
  blogId: string,
  options: { livePage?: number; livePerPage?: number } = {},
): Promise<BlogPostsResult> {
  await requireAdmin();

  const { livePage = 1, livePerPage = 20 } = options;

  const [blog] = await db
    .select({
      platform: blogs.platform,
      // WordPress
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
      // Shopify (both auth modes)
      shopifyAuthMode: blogs.shopifyAuthMode,
      shopifyStoreUrl: blogs.shopifyStoreUrl,
      shopifyAdminApiToken: blogs.shopifyAdminApiToken,
      shopifyClientId: blogs.shopifyClientId,
      shopifyClientSecret: blogs.shopifyClientSecret,
      shopifyApiVersion: blogs.shopifyApiVersion,
      shopifyBlogId: blogs.shopifyBlogId,
    })
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!blog) throw new Error("Blog not found");

  const generatedRows = await db
    .select({
      id: generatedPosts.id,
      topic: generatedPosts.topic,
      title: generatedPosts.title,
      status: generatedPosts.status,
      wordCount: generatedPosts.wordCount,
      seoScore: generatedPosts.seoScore,
      featuredImageUrl: generatedPosts.featuredImageUrl,
      externalPostId: generatedPosts.externalPostId,
      externalPostUrl: generatedPosts.externalPostUrl,
      failureReason: generatedPosts.failureReason,
      isAutoGenerated: generatedPosts.isAutoGenerated,
      generatedAt: generatedPosts.generatedAt,
      publishedAt: generatedPosts.publishedAt,
      createdAt: generatedPosts.createdAt,
    })
    .from(generatedPosts)
    .where(eq(generatedPosts.blogId, blogId))
    .orderBy(desc(generatedPosts.createdAt))
    .limit(50);

  const live: BlogPostsResult["live"] = {
    available: false,
    platform: blog.platform,
    posts: [],
    page: livePage,
    perPage: livePerPage,
    total: 0,
    totalPages: 0,
  };

  if (
    blog.platform === "wordpress" &&
    blog.wpUrl &&
    blog.wpUsername &&
    blog.wpAppPassword
  ) {
    try {
      const result = await wp.fetchPosts(
        blog.wpUrl,
        blog.wpUsername,
        blog.wpAppPassword,
        {
          page: livePage,
          perPage: livePerPage,
          statuses: ["publish", "future", "draft", "pending", "private"],
        },
      );
      live.available = true;
      live.total = result.total;
      live.totalPages = result.totalPages;
      live.posts = result.posts.map((p) => ({
        id: p.id,
        title: stripHtml(p.title?.rendered ?? ""),
        excerpt: stripHtml(p.excerpt?.rendered ?? "").slice(0, 240),
        status: p.status,
        link: p.link,
        date: p.date,
        modified: p.modified,
      }));
    } catch (err) {
      live.error =
        err instanceof Error ? err.message : "Failed to fetch WordPress posts";
    }
  } else if (blog.platform === "wordpress") {
    live.error = "WordPress credentials not configured";
  } else if (blog.platform === "shopify") {
    // Build creds for either auth mode and fetch every live article.
    // Shopify's REST API doesn't paginate by page-number, so we pull
    // everything once and slice client-side. Cheap for typical blog sizes.
    const mode = blog.shopifyAuthMode ?? "client_credentials";
    let creds: ShopifyCreds | null = null;

    if (!blog.shopifyStoreUrl) {
      live.error = "Shopify store URL not configured";
    } else if (mode === "legacy_token") {
      if (!blog.shopifyAdminApiToken) {
        live.error = "Shopify Admin API token not configured";
      } else {
        creds = {
          mode: "legacy_token",
          storeUrl: blog.shopifyStoreUrl,
          adminToken: blog.shopifyAdminApiToken,
        };
      }
    } else {
      if (!blog.shopifyClientId || !blog.shopifyClientSecret) {
        live.error = "Shopify Client ID and Client Secret not configured";
      } else {
        creds = {
          mode: "client_credentials",
          storeUrl: blog.shopifyStoreUrl,
          clientId: blog.shopifyClientId,
          clientSecret: blog.shopifyClientSecret,
        };
      }
    }

    if (creds) {
      try {
        const articles = await shopifyFetchAllLive(
          creds,
          blog.shopifyApiVersion ?? undefined,
          blog.shopifyBlogId ?? undefined,
        );

          const storeHost = (blog.shopifyStoreUrl ?? "")
          .trim()
          .replace(/^https?:\/\//i, "")
          .replace(/\/+$/, "");

        const all = articles.map((a) => ({
          id: a.id,
          title: a.title,
          excerpt: stripHtml(a.summary_html || a.body_html || "").slice(0, 240),
          status: a.published_at ? "publish" : "draft",
          link: storeHost
            ? `https://${storeHost}/blogs/${a.blog_id}/${a.handle}`
            : "",
          date: a.published_at ?? a.created_at,
          modified: a.updated_at,
        }));

        live.available = true;
        live.total = all.length;
        live.totalPages = Math.max(1, Math.ceil(all.length / livePerPage));
        const start = (livePage - 1) * livePerPage;
        live.posts = all.slice(start, start + livePerPage);
      } catch (err) {
        live.error =
          err instanceof Error ? err.message : "Failed to fetch Shopify posts";
      }
    }
  } else {
    live.error = `Live post management is not yet supported on ${blog.platform}`;
  }

  return { generated: generatedRows, live };
}

export async function editBlogLivePost(
  blogId: string,
  postId: number,
  data: {
    title?: string;
    content?: string;
    excerpt?: string;
    status?: "publish" | "draft" | "pending" | "private";
  },
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  const [blog] = await db
    .select({
      platform: blogs.platform,
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
    })
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!blog) return { success: false, message: "Blog not found" };
  if (blog.platform !== "wordpress") {
    return {
      success: false,
      message: `Editing not supported on ${blog.platform} yet`,
    };
  }
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { success: false, message: "WordPress credentials not configured" };
  }

  try {
    await wp.updatePost(
      blog.wpUrl,
      blog.wpUsername,
      blog.wpAppPassword,
      postId,
      data,
    );
    revalidatePath(`/blogs/${blogId}`);
    return { success: true, message: "Post updated" };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Update failed",
    };
  }
}

export async function deleteBlogLivePost(
  blogId: string,
  postId: number,
  force: boolean = false,
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  const [blog] = await db
    .select({
      platform: blogs.platform,
      wpUrl: blogs.wpUrl,
      wpUsername: blogs.wpUsername,
      wpAppPassword: blogs.wpAppPassword,
    })
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!blog) return { success: false, message: "Blog not found" };
  if (blog.platform !== "wordpress") {
    return {
      success: false,
      message: `Deletion not supported on ${blog.platform} yet`,
    };
  }
  if (!blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    return { success: false, message: "WordPress credentials not configured" };
  }

  try {
    const result = await wp.deletePost(
      blog.wpUrl,
      blog.wpUsername,
      blog.wpAppPassword,
      postId,
      force,
    );
    revalidatePath(`/blogs/${blogId}`);
    return {
      success: true,
      message: result.permanently
        ? "Post permanently deleted"
        : "Post moved to trash",
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Delete failed",
    };
  }
}