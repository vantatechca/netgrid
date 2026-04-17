"use server";

import { db } from "@/lib/db";
import { blogs, seoScans, seoIssues, clients } from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAdmin, getSession } from "@/lib/auth/helpers";
import { crawlBlog } from "@/lib/services/seo-crawler";
import { scoreBlog } from "@/lib/services/seo-scorer";
import { generateSeoFix } from "@/lib/services/claude-client";
import { logActivity } from "@/lib/services/activity-logger";
import type { IssueStatus } from "@/lib/types";

export async function triggerSeoScan(blogId: string) {
  await requireAdmin();

  const [blog] = await db.select().from(blogs).where(eq(blogs.id, blogId)).limit(1);
  if (!blog || !blog.wpUrl) throw new Error("Blog not found or missing WP URL");

  // Crawl the blog
  const pages = await crawlBlog(blog.wpUrl);
  const scores = scoreBlog(pages);

  // Store scan results
  const [scan] = await db.insert(seoScans).values({
    blogId: blog.id,
    clientId: blog.clientId,
    overallScore: scores.overall,
    metaScore: scores.meta,
    contentScore: scores.content,
    technicalScore: scores.technical,
    linkScore: scores.links,
    imageScore: scores.images,
    pagesCrawled: scores.pagesCrawled,
    issuesFound: scores.issuesFound,
    criticalIssues: scores.criticalIssues,
    warnings: scores.warnings,
    notices: scores.notices,
    rawData: pages,
    scanDurationMs: 0,
  }).returning();

  // Store individual issues
  if (scores.issues.length > 0) {
    await db.insert(seoIssues).values(
      scores.issues.map((issue) => ({
        scanId: scan.id,
        blogId: blog.id,
        clientId: blog.clientId,
        pageUrl: issue.pageUrl,
        category: issue.category as "meta" | "content" | "technical" | "links" | "images" | "schema" | "performance",
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        autoFixable: issue.autoFixable,
        status: "detected" as const,
      }))
    );
  }

  // Update blog's cached score
  await db.update(blogs).set({
    currentSeoScore: scores.overall,
    lastSeoScanAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(blogs.id, blogId));

  const session = await getSession();
  await logActivity({
    userId: session?.user?.id,
    clientId: blog.clientId,
    action: "seo_scan_completed",
    entityType: "blog",
    entityId: blogId,
    details: { score: scores.overall, issues: scores.issuesFound },
  });

  return { scan, scores };
}

export async function getSeoScans(blogId?: string, clientId?: string, page = 1, pageSize = 25) {
  await requireAdmin();

  const conditions = [];
  if (blogId) conditions.push(eq(seoScans.blogId, blogId));
  if (clientId) conditions.push(eq(seoScans.clientId, clientId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [scans, [{ count }]] = await Promise.all([
    db.select()
      .from(seoScans)
      .where(where)
      .orderBy(desc(seoScans.scannedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` })
      .from(seoScans)
      .where(where),
  ]);

  return { scans, total: count, page, pageSize };
}

export async function getSeoIssues(params: {
  blogId?: string;
  clientId?: string;
  status?: IssueStatus;
  severity?: string;
  autoFixable?: boolean;
  page?: number;
  pageSize?: number;
}) {
  await requireAdmin();

  const { blogId, clientId, status, severity, autoFixable, page = 1, pageSize = 25 } = params;

  const conditions = [];
  if (blogId) conditions.push(eq(seoIssues.blogId, blogId));
  if (clientId) conditions.push(eq(seoIssues.clientId, clientId));
  if (status) conditions.push(eq(seoIssues.status, status));
  if (severity) conditions.push(eq(seoIssues.severity, severity as "critical" | "warning" | "notice"));
  if (autoFixable !== undefined) conditions.push(eq(seoIssues.autoFixable, autoFixable));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [issues, [{ count }]] = await Promise.all([
    db.select()
      .from(seoIssues)
      .where(where)
      .orderBy(desc(seoIssues.detectedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` })
      .from(seoIssues)
      .where(where),
  ]);

  return { issues, total: count, page, pageSize };
}

export async function getFixQueue(clientId?: string) {
  await requireAdmin();

  const conditions = [
    inArray(seoIssues.status, ["detected", "queued"]),
  ];
  if (clientId) conditions.push(eq(seoIssues.clientId, clientId));

  const issues = await db.select({
    issue: seoIssues,
    blogDomain: blogs.domain,
  })
    .from(seoIssues)
    .innerJoin(blogs, eq(seoIssues.blogId, blogs.id))
    .where(and(...conditions))
    .orderBy(
      sql`CASE WHEN ${seoIssues.severity} = 'critical' THEN 0 WHEN ${seoIssues.severity} = 'warning' THEN 1 ELSE 2 END`,
      desc(seoIssues.detectedAt)
    );

  return issues;
}

export async function generateFixContent(issueId: string) {
  await requireAdmin();

  const [issue] = await db.select().from(seoIssues).where(eq(seoIssues.id, issueId)).limit(1);
  if (!issue) throw new Error("Issue not found");

  const [blog] = await db.select().from(blogs).where(eq(blogs.id, issue.blogId)).limit(1);
  const [client] = await db.select().from(clients).where(eq(clients.id, issue.clientId)).limit(1);

  const fixContent = await generateSeoFix({
    niche: client?.niche || "general",
    blogDomain: blog?.domain || "",
    pageUrl: issue.pageUrl || "",
    pageTitle: issue.title,
    pageContentExcerpt: "",
    issueType: issue.category,
    issueDescription: issue.description || "",
  });

  await db.update(seoIssues).set({
    suggestedFix: fixContent,
    status: "queued",
  }).where(eq(seoIssues.id, issueId));

  return fixContent;
}

export async function approveIssue(issueId: string) {
  const session = await requireAdmin();

  await db.update(seoIssues).set({
    status: "approved",
    approvedBy: session.user.id,
    approvedAt: new Date(),
  }).where(eq(seoIssues.id, issueId));

  await logActivity({
    userId: session.user.id,
    action: "seo_fix_approved",
    entityType: "seo_issue",
    entityId: issueId,
  });
}

export async function dismissIssue(issueId: string) {
  const session = await requireAdmin();

  await db.update(seoIssues).set({
    status: "dismissed",
    resolvedAt: new Date(),
  }).where(eq(seoIssues.id, issueId));

  await logActivity({
    userId: session.user.id,
    action: "seo_fix_dismissed",
    entityType: "seo_issue",
    entityId: issueId,
  });
}

export async function executeApprovedFix(issueId: string) {
  const session = await requireAdmin();

  const [issue] = await db.select().from(seoIssues).where(eq(seoIssues.id, issueId)).limit(1);
  if (!issue || issue.status !== "approved") throw new Error("Issue not approved");

  const [blog] = await db.select().from(blogs).where(eq(blogs.id, issue.blogId)).limit(1);
  if (!blog || !blog.wpUrl || !blog.wpUsername || !blog.wpAppPassword) {
    throw new Error("Blog credentials missing");
  }

  try {
    // Execute the fix via WP REST API
    const { default: axios } = await import("axios");
    const fixPayload = issue.fixPayload as { endpoint: string; method: string; body: Record<string, unknown> } | null;

    if (fixPayload) {
      const url = `${blog.wpUrl}${fixPayload.endpoint}`;
      const auth = Buffer.from(`${blog.wpUsername}:${blog.wpAppPassword}`).toString("base64");

      await axios({
        method: fixPayload.method as "post" | "put" | "patch",
        url,
        data: fixPayload.body,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });
    }

    await db.update(seoIssues).set({
      status: "applied",
      appliedAt: new Date(),
    }).where(eq(seoIssues.id, issueId));

    await logActivity({
      userId: session.user.id,
      action: "seo_fix_applied",
      entityType: "seo_issue",
      entityId: issueId,
    });

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    await db.update(seoIssues).set({
      status: "failed",
      failureReason: errorMsg,
    }).where(eq(seoIssues.id, issueId));

    return { success: false, error: errorMsg };
  }
}
