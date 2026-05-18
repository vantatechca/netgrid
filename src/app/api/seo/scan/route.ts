/**
 * app/api/seo/scan/route.ts
 *
 * POST /api/seo/scan
 *   body: { blogId: string }           → scan one blog
 *   body: { scanAll: true }            → scan every active blog
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogs, seoScans, seoIssues } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { scanBlog, type BlogDescriptor } from "@/lib/seo/scanner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function blogToDescriptor(blog: typeof blogs.$inferSelect): BlogDescriptor {
  return {
    id: blog.id,
    platform: blog.platform,
    domain: blog.domain,
    wpUrl: blog.wpUrl,
    wpUsername: blog.wpUsername,
    wpAppPassword: blog.wpAppPassword,
    seoPlugin: blog.seoPlugin,
    shopifyStoreUrl: blog.shopifyStoreUrl,
    shopifyAdminApiToken: blog.shopifyAdminApiToken,
  };
}

async function runScanForBlog(blog: typeof blogs.$inferSelect) {
  const descriptor = blogToDescriptor(blog);
  const result = await scanBlog(descriptor);

  // 1. Insert scan record
  const [scan] = await db
    .insert(seoScans)
    .values({
      blogId: blog.id,
      clientId: blog.clientId,
      overallScore: result.overallScore,
      metaScore: result.metaScore,
      contentScore: result.contentScore,
      technicalScore: result.technicalScore,
      linkScore: result.linkScore,
      imageScore: result.imageScore,
      pagesCrawled: result.pagesCrawled,
      issuesFound: result.issuesFound,
      criticalIssues: result.criticalIssues,
      warnings: result.warnings,
      notices: result.notices,
      scanDurationMs: result.scanDurationMs,
      rawData: result.rawData,
    })
    .returning({ id: seoScans.id });

  // 2. Dismiss old open issues for this blog before inserting fresh ones
  //    (keeps only detected/queued → mark them superseded by new scan)
  await db
    .update(seoIssues)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(
      and(
        eq(seoIssues.blogId, blog.id),
        inArray(seoIssues.status, ["detected", "queued"]),
      ),
    );

  // 3. Insert fresh issues
  if (result.issues.length > 0) {
    await db.insert(seoIssues).values(
      result.issues.map((issue) => ({
        scanId: scan.id,
        blogId: blog.id,
        clientId: blog.clientId,
        pageUrl: issue.pageUrl,
        category: issue.category,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        autoFixable: issue.autoFixable,
        fixPayload: issue.fixPayload ?? null,
        status: "detected" as const,
      })),
    );
  }

  // 4. Update blog's cached SEO score + last scan timestamp
  await db
    .update(blogs)
    .set({
      currentSeoScore: result.overallScore,
      lastSeoScanAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(blogs.id, blog.id));

  return result;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Scan All ──────────────────────────────────────────────────────────────
    if (body.scanAll === true) {
      const allBlogs = await db
        .select()
        .from(blogs)
        .where(inArray(blogs.status, ["active", "setup"]));

      let scanned = 0;
      let failed = 0;

      await Promise.allSettled(
        allBlogs.map(async (blog) => {
          try {
            await runScanForBlog(blog);
            scanned++;
          } catch (err) {
            console.error(`[seo/scan] Failed for blog ${blog.domain}:`, err);
            failed++;
          }
        }),
      );

      return NextResponse.json({ scanned, failed });
    }

    // ── Single Blog ───────────────────────────────────────────────────────────
    const { blogId } = body;
    if (!blogId || typeof blogId !== "string") {
      return NextResponse.json(
        { error: "blogId is required" },
        { status: 400 },
      );
    }

    const [blog] = await db.select().from(blogs).where(eq(blogs.id, blogId));
    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    const result = await runScanForBlog(blog);

    return NextResponse.json({
      overallScore: result.overallScore,
      issuesFound: result.issuesFound,
      criticalIssues: result.criticalIssues,
      warnings: result.warnings,
      notices: result.notices,
      pagesCrawled: result.pagesCrawled,
      scanDurationMs: result.scanDurationMs,
    });
  } catch (err) {
    console.error("[seo/scan] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}