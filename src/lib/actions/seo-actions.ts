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

// ─── Consolidated SEO tracking (per client / per site) ───────────────────────

export interface SeoSiteSummary {
  blogId: string;
  domain: string;
  platform: "wordpress" | "shopify";
  score: number | null;
  lastScanAt: Date | null;
  openIssues: number;
  autoFixableOpen: number;
  criticalOpen: number;
  fixed: number;
  failed: number;
}

export interface SeoClientSummary {
  clientId: string;
  clientName: string;
  status: string | null;
  sites: SeoSiteSummary[];
  totals: {
    sites: number;
    openIssues: number;
    autoFixableOpen: number;
    criticalOpen: number;
    fixed: number;
    failed: number;
    avgScore: number | null;
  };
}

export interface SeoTrackingSummary {
  clients: SeoClientSummary[];
  grand: {
    clients: number;
    sites: number;
    openIssues: number;
    autoFixableOpen: number;
    criticalOpen: number;
    fixed: number;
    failed: number;
  };
}

/**
 * Roll the SEO issue queue up by client → site for at-a-glance tracking:
 * how many issues are open, how many are auto-fixable right now, how many
 * have been fixed, and how many failed — per site and per client. One
 * aggregate query over seo_issues plus a join against clients/blogs, so it
 * stays cheap across the whole network.
 */
export async function getSeoTrackingSummary(): Promise<SeoTrackingSummary> {
  await requireAdmin();

  // Per-blog issue counts via filtered aggregates (single pass over the table).
  const counts = await db
    .select({
      blogId: seoIssues.blogId,
      openIssues: sql<number>`count(*) filter (where ${seoIssues.status} in ('detected','queued'))`,
      autoFixableOpen: sql<number>`count(*) filter (where ${seoIssues.status} in ('detected','queued') and ${seoIssues.autoFixable} = true)`,
      criticalOpen: sql<number>`count(*) filter (where ${seoIssues.status} in ('detected','queued') and ${seoIssues.severity} = 'critical')`,
      fixed: sql<number>`count(*) filter (where ${seoIssues.status} in ('applied','verified'))`,
      failed: sql<number>`count(*) filter (where ${seoIssues.status} = 'failed')`,
    })
    .from(seoIssues)
    .groupBy(seoIssues.blogId);

  const countByBlog = new Map(counts.map((c) => [c.blogId, c]));

  // Clients + their blogs (exclude decommissioned blogs from tracking).
  const clientRows = await db
    .select({ id: clients.id, name: clients.name, status: clients.status })
    .from(clients)
    .orderBy(clients.name);

  const blogRows = await db
    .select({
      id: blogs.id,
      clientId: blogs.clientId,
      domain: blogs.domain,
      platform: blogs.platform,
      score: blogs.currentSeoScore,
      lastScanAt: blogs.lastSeoScanAt,
    })
    .from(blogs)
    .where(inArray(blogs.status, ["active", "paused", "setup"]));

  const blogsByClient = new Map<string, typeof blogRows>();
  for (const b of blogRows) {
    const list = blogsByClient.get(b.clientId) ?? [];
    list.push(b);
    blogsByClient.set(b.clientId, list);
  }

  const grand = {
    clients: 0,
    sites: 0,
    openIssues: 0,
    autoFixableOpen: 0,
    criticalOpen: 0,
    fixed: 0,
    failed: 0,
  };

  const clientSummaries: SeoClientSummary[] = [];

  for (const client of clientRows) {
    const clientBlogs = blogsByClient.get(client.id) ?? [];
    if (clientBlogs.length === 0) continue;

    const sites: SeoSiteSummary[] = clientBlogs.map((b) => {
      const c = countByBlog.get(b.id);
      return {
        blogId: b.id,
        domain: b.domain,
        platform: b.platform,
        score: b.score,
        lastScanAt: b.lastScanAt,
        openIssues: Number(c?.openIssues ?? 0),
        autoFixableOpen: Number(c?.autoFixableOpen ?? 0),
        criticalOpen: Number(c?.criticalOpen ?? 0),
        fixed: Number(c?.fixed ?? 0),
        failed: Number(c?.failed ?? 0),
      };
    });

    // Sort sites worst-first (most open critical, then most open issues).
    sites.sort(
      (a, b) =>
        b.criticalOpen - a.criticalOpen ||
        b.openIssues - a.openIssues ||
        a.domain.localeCompare(b.domain),
    );

    const scored = sites.filter((s) => s.score !== null);
    const totals = {
      sites: sites.length,
      openIssues: sites.reduce((n, s) => n + s.openIssues, 0),
      autoFixableOpen: sites.reduce((n, s) => n + s.autoFixableOpen, 0),
      criticalOpen: sites.reduce((n, s) => n + s.criticalOpen, 0),
      fixed: sites.reduce((n, s) => n + s.fixed, 0),
      failed: sites.reduce((n, s) => n + s.failed, 0),
      avgScore:
        scored.length > 0
          ? Math.round(scored.reduce((n, s) => n + (s.score ?? 0), 0) / scored.length)
          : null,
    };

    grand.clients += 1;
    grand.sites += totals.sites;
    grand.openIssues += totals.openIssues;
    grand.autoFixableOpen += totals.autoFixableOpen;
    grand.criticalOpen += totals.criticalOpen;
    grand.fixed += totals.fixed;
    grand.failed += totals.failed;

    clientSummaries.push({
      clientId: client.id,
      clientName: client.name,
      status: client.status,
      sites,
      totals,
    });
  }

  // Clients with the most open work first.
  clientSummaries.sort(
    (a, b) =>
      b.totals.criticalOpen - a.totals.criticalOpen ||
      b.totals.openIssues - a.totals.openIssues ||
      a.clientName.localeCompare(b.clientName),
  );

  return { clients: clientSummaries, grand };
}
