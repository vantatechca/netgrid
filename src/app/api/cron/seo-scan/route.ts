import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { blogs, seoScans, seoIssues } from "@/lib/db/schema";
import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import { crawlBlog } from "@/lib/services/seo-crawler";
import { scoreBlog } from "@/lib/services/seo-scorer";
import {
  runPageSpeedAudit,
  severityFromAuditScore,
} from "@/lib/services/pagespeed-client";

export const maxDuration = 120;

type BlogRow = typeof blogs.$inferSelect;

/**
 * Pick the public URL for whichever platform the blog uses, normalized to
 * include a protocol. Both crawler and PageSpeed are URL-agnostic — they
 * just need a public-facing site with `https://`.
 */
function scanUrlFor(blog: BlogRow): string | null {
  const raw = blog.platform === "shopify" ? blog.shopifyStoreUrl : blog.wpUrl;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Shopify admin often stores domains as bare hostnames; PSI/crawler need a
  // scheme. Default to https — Shopify storefronts redirect plain http anyway.
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Pick the oldest-scanned active blog that has *some* scannable URL.
    // The previous version filtered on wpUrl alone, which made the cron exit
    // with "no blogs to scan" if the oldest happened to be a Shopify blog.
    const [blog] = await db
      .select()
      .from(blogs)
      .where(
        and(
          eq(blogs.status, "active"),
          or(isNotNull(blogs.wpUrl), isNotNull(blogs.shopifyStoreUrl)),
        ),
      )
      .orderBy(asc(sql`coalesce(${blogs.lastSeoScanAt}, '1970-01-01')`))
      .limit(1);

    if (!blog) {
      return NextResponse.json({ message: "No blogs to scan" });
    }

    const scanUrl = scanUrlFor(blog);
    if (!scanUrl) {
      return NextResponse.json({
        message: `Skipping ${blog.domain} — no scannable URL for platform ${blog.platform}`,
      });
    }

    const startTime = Date.now();

    // Cheerio crawl + PSI in parallel. Each failure is contained so one bad
    // service doesn't kill the whole scan — we log it and continue with
    // empty data, then the PSI fallback path picks up.
    const [pagesResult, pagespeedResult] = await Promise.allSettled([
      crawlBlog(scanUrl, 20),
      runPageSpeedAudit(scanUrl, "mobile"),
    ]);

    const pages =
      pagesResult.status === "fulfilled" ? pagesResult.value : [];
    if (pagesResult.status === "rejected") {
      console.error(`[seo-scan] crawler failed for ${scanUrl}:`, pagesResult.reason);
    }

    const pagespeed =
      pagespeedResult.status === "fulfilled"
        ? pagespeedResult.value
        : {
            scores: {
              seo: null,
              performance: null,
              accessibility: null,
              bestPractices: null,
            },
            vitals: {},
            failedAudits: [],
            error:
              pagespeedResult.status === "rejected"
                ? pagespeedResult.reason instanceof Error
                  ? pagespeedResult.reason.message
                  : String(pagespeedResult.reason)
                : null,
          };
    if (pagespeedResult.status === "rejected") {
      console.error(`[seo-scan] PSI failed for ${scanUrl}:`, pagespeedResult.reason);
    }

    const scores = scoreBlog(pages);
    const duration = Date.now() - startTime;

    // PSI's SEO score is THE score when available — that's what the user
    // wants displayed everywhere. Fall back to the cheerio overall only if
    // PSI couldn't compute it (API down / quota / transient error).
    const displayedScore = pagespeed.scores.seo ?? scores.overall;

    const [scan] = await db
      .insert(seoScans)
      .values({
        blogId: blog.id,
        clientId: blog.clientId,
        overallScore: displayedScore,
        metaScore: scores.meta,
        contentScore: scores.content,
        // technicalScore now reflects PSI's performance category (the closest
        // analogue), with the cheerio technical score as fallback.
        technicalScore: pagespeed.scores.performance ?? scores.technical,
        linkScore: scores.links,
        imageScore: scores.images,
        pagesCrawled: scores.pagesCrawled,
        issuesFound: scores.issuesFound + pagespeed.failedAudits.length,
        criticalIssues: scores.criticalIssues,
        warnings: scores.warnings,
        notices: scores.notices,
        rawData: { pages, pagespeed },
        scanDurationMs: duration,
      })
      .returning();

    if (scores.issues.length > 0) {
      await db.insert(seoIssues).values(
        scores.issues.map((issue) => ({
          scanId: scan.id,
          blogId: blog.id,
          clientId: blog.clientId,
          pageUrl: issue.pageUrl,
          category: issue.category as
            | "meta" | "content" | "technical" | "links" | "images" | "schema" | "performance",
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          autoFixable: issue.autoFixable,
          status: "detected" as const,
        })),
      );
    }

    if (pagespeed.failedAudits.length > 0) {
      await db.insert(seoIssues).values(
        pagespeed.failedAudits.map((audit) => ({
          scanId: scan.id,
          blogId: blog.id,
          clientId: blog.clientId,
          pageUrl: scanUrl,
          category: "performance" as const,
          severity: severityFromAuditScore(audit.score),
          title: audit.title,
          description: audit.displayValue
            ? `${audit.description} (current: ${audit.displayValue})`
            : audit.description,
          autoFixable: false,
          status: "detected" as const,
        })),
      );
    }

    await db
      .update(blogs)
      .set({
        currentSeoScore: displayedScore, // ← PSI SEO score (or crawler fallback)
        lastSeoScanAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(blogs.id, blog.id));

    return NextResponse.json({
      blog: blog.domain,
      platform: blog.platform,
      scanUrl,
      score: displayedScore,
      source: pagespeed.scores.seo !== null ? "pagespeed" : "crawler-fallback",
      pageSpeed: {
        seo: pagespeed.scores.seo,
        performance: pagespeed.scores.performance,
        accessibility: pagespeed.scores.accessibility,
        bestPractices: pagespeed.scores.bestPractices,
        vitals: pagespeed.vitals,
        error: pagespeed.error,
      },
      issues: scores.issuesFound + pagespeed.failedAudits.length,
      pages: scores.pagesCrawled,
      durationMs: duration,
    });
  } catch (error) {
    console.error("SEO scan cron error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown scan error";
    // Surface the actual error so we can diagnose without grepping logs.
    return NextResponse.json(
      {
        error: "Scan failed",
        message,
        ...(error instanceof Error && error.stack && process.env.NODE_ENV !== "production"
          ? { stack: error.stack.split("\n").slice(0, 8) }
          : {}),
      },
      { status: 500 },
    );
  }
}
