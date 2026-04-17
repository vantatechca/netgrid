import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { blogs, seoScans, seoIssues } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { crawlBlog } from "@/lib/services/seo-crawler";
import { scoreBlog } from "@/lib/services/seo-scorer";

export const maxDuration = 60; // Vercel Pro timeout

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get the blog that was scanned least recently
    const [blog] = await db.select()
      .from(blogs)
      .where(eq(blogs.status, "active"))
      .orderBy(asc(sql`coalesce(${blogs.lastSeoScanAt}, '1970-01-01')`))
      .limit(1);

    if (!blog || !blog.wpUrl) {
      return NextResponse.json({ message: "No blogs to scan" });
    }

    const startTime = Date.now();
    const pages = await crawlBlog(blog.wpUrl, 20); // Limit pages per cron run
    const scores = scoreBlog(pages);
    const duration = Date.now() - startTime;

    // Store scan
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
      scanDurationMs: duration,
    }).returning();

    // Store issues
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

    // Update blog cache
    await db.update(blogs).set({
      currentSeoScore: scores.overall,
      lastSeoScanAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(blogs.id, blog.id));

    return NextResponse.json({
      blog: blog.domain,
      score: scores.overall,
      issues: scores.issuesFound,
      pages: scores.pagesCrawled,
      durationMs: duration,
    });
  } catch (error) {
    console.error("SEO scan cron error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
