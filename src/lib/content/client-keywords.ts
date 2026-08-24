import "server-only";
import { db } from "@/lib/db";
import { clientKeywords } from "@/lib/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";

export interface ActiveClientKeyword {
  keyword: string;
  searchVolume: number | null;
  source: string;
}

/**
 * The top active scraped keyword rows for a client, best-ranked first. Ranks
 * by real search volume when a volume-bearing source has populated it,
 * otherwise by the Autocomplete popularity proxy (hitCount, then best
 * position) — the ordering both callers below share, and the seam a future
 * volume-bearing provider (DataForSEO) plugs into transparently. Fail-safe
 * to [].
 */
async function activeClientKeywordRows(
  clientId: string,
  limit: number,
): Promise<ActiveClientKeyword[]> {
  try {
    return await db
      .select({
        keyword: clientKeywords.keyword,
        searchVolume: clientKeywords.searchVolume,
        source: clientKeywords.source,
      })
      .from(clientKeywords)
      .where(
        and(
          eq(clientKeywords.clientId, clientId),
          eq(clientKeywords.isActive, true),
        ),
      )
      .orderBy(
        sql`${clientKeywords.searchVolume} desc nulls last`,
        desc(clientKeywords.hitCount),
        asc(clientKeywords.bestPosition),
      )
      .limit(limit);
  } catch {
    return [];
  }
}

/**
 * The top active scraped keywords for a client, best-ranked first — merged into
 * the ideation keyword pool by getActiveKnowledgeForBlog so every generated post
 * targets them. Fail-safe to [].
 */
export async function topActiveClientKeywords(
  clientId: string,
  limit = 40,
): Promise<string[]> {
  const rows = await activeClientKeywordRows(clientId, limit);
  return rows.map((r) => r.keyword);
}

/**
 * Same ranking as topActiveClientKeywords, but with the search volume and
 * source each row carries — the local-keyword-targeting ledger snapshots
 * these onto blog_keyword_targets (see keyword-target-actions.ts) so its rows
 * stay meaningful even if a keyword is later re-ranked or deactivated.
 */
export async function topActiveClientKeywordsWithMeta(
  clientId: string,
  limit = 40,
): Promise<ActiveClientKeyword[]> {
  return activeClientKeywordRows(clientId, limit);
}
