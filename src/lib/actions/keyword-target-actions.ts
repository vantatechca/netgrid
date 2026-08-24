"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogs, blogKeywordTargets } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/helpers";
import { topActiveClientKeywordsWithMeta } from "@/lib/content/client-keywords";
import {
  buildKeywordTargetTitle,
  isEligibleKeywordTarget,
  normalizeTargetKeyword,
} from "@/lib/content/keyword-targeting";

export type BlogKeywordTarget = typeof blogKeywordTargets.$inferSelect;

/** Cap on how many of a client's top-ranked keywords become ledger candidates. */
const CANDIDATE_LIMIT = 40;

interface BuildResult {
  blogId: string;
  city: string | null;
  targeted: boolean;
  candidatesConsidered: number;
  eligible: number;
  upserted: number;
  message: string;
}

/**
 * Distinct assigned cities across the whole network — input to the
 * keyword/city collision filter (a keyword that already names a city, its
 * own or another blog's, is not a sane target; see keyword-targeting.ts).
 */
async function knownCities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: blogs.city })
    .from(blogs)
    .where(isNotNull(blogs.city));
  return rows.map((r) => r.city).filter((c): c is string => Boolean(c));
}

/**
 * Build (or refresh) one blog's keyword-target ledger from its client's
 * scraped keywords. No-ops when the blog has no city — that IS the feature's
 * on/off switch (see docs/local-keyword-content-plan.md). A rebuild only ever
 * touches ranking/title metadata: a target already
 * generating/generated/failed/skipped keeps its status untouched, since that
 * column is deliberately absent from the upsert's `set`.
 */
async function buildKeywordTargetsForBlogCore(blogId: string): Promise<BuildResult> {
  const [blog] = await db
    .select({ id: blogs.id, clientId: blogs.clientId, city: blogs.city })
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);

  if (!blog) {
    return {
      blogId, city: null, targeted: false,
      candidatesConsidered: 0, eligible: 0, upserted: 0,
      message: "Blog not found.",
    };
  }

  const city = blog.city;
  if (!city) {
    return {
      blogId, city: null, targeted: false,
      candidatesConsidered: 0, eligible: 0, upserted: 0,
      message: "No city assigned — this blog stays on ordinary topic ideation.",
    };
  }

  const [candidates, cities] = await Promise.all([
    topActiveClientKeywordsWithMeta(blog.clientId, CANDIDATE_LIMIT),
    knownCities(),
  ]);

  const eligible = candidates.filter((c) => isEligibleKeywordTarget(c.keyword, cities));

  if (eligible.length === 0) {
    return {
      blogId, city, targeted: true,
      candidatesConsidered: candidates.length, eligible: 0, upserted: 0,
      message:
        candidates.length === 0
          ? "This client has no active scraped keywords yet."
          : "Every scraped keyword was filtered out (navigational, or already names a city).",
    };
  }

  const now = new Date();
  const rows = eligible.map((c, index) => ({
    blogId: blog.id,
    clientId: blog.clientId,
    keyword: normalizeTargetKeyword(c.keyword),
    city,
    topicTitle: buildKeywordTargetTitle(c.keyword, city),
    // Rank snapshot at build time — lower is better. Real search volume once
    // DataForSEO lands; the Autocomplete popularity proxy until then (the
    // candidates arrive pre-sorted by topActiveClientKeywordsWithMeta).
    priority: index,
    keywordSource: c.source,
    searchVolume: c.searchVolume,
    updatedAt: now,
  }));

  const upserted = await db
    .insert(blogKeywordTargets)
    .values(rows)
    .onConflictDoUpdate({
      target: [blogKeywordTargets.blogId, blogKeywordTargets.keyword, blogKeywordTargets.city],
      set: {
        topicTitle: sql`excluded.topic_title`,
        priority: sql`excluded.priority`,
        keywordSource: sql`excluded.keyword_source`,
        searchVolume: sql`excluded.search_volume`,
        updatedAt: now,
      },
    })
    .returning({ id: blogKeywordTargets.id });

  return {
    blogId, city, targeted: true,
    candidatesConsidered: candidates.length,
    eligible: eligible.length,
    upserted: upserted.length,
    message: `${upserted.length} keyword target${upserted.length === 1 ? "" : "s"} up to date for ${city}.`,
  };
}

/** Admin-triggered on-demand rebuild for one blog (e.g. after assigning a city). */
export async function buildKeywordTargetsForBlog(blogId: string): Promise<BuildResult> {
  await requireAdmin();
  const result = await buildKeywordTargetsForBlogCore(blogId);
  revalidatePath(`/blogs/${blogId}`);
  return result;
}

/**
 * Rebuild every active, city-bearing blog's ledger. Called by the
 * refresh-keywords cron right after the scrape (see
 * /api/cron/refresh-keywords) so new keywords automatically become new
 * targets. Never throws — a failing blog is recorded and skipped so one bad
 * blog can't stall the run.
 */
export async function rebuildAllKeywordTargetsInternal(): Promise<{
  blogsProcessed: number;
  blogsTargeted: number;
  targetsUpserted: number;
  failed: Array<{ blogId: string; error: string }>;
}> {
  const rows = await db
    .select({ id: blogs.id })
    .from(blogs)
    .where(and(isNotNull(blogs.city), eq(blogs.status, "active")));

  let blogsTargeted = 0;
  let targetsUpserted = 0;
  const failed: Array<{ blogId: string; error: string }> = [];

  for (const { id } of rows) {
    try {
      const result = await buildKeywordTargetsForBlogCore(id);
      if (result.targeted) blogsTargeted++;
      targetsUpserted += result.upserted;
    } catch (err) {
      failed.push({
        blogId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { blogsProcessed: rows.length, blogsTargeted, targetsUpserted, failed };
}
