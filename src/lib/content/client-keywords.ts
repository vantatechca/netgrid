import "server-only";
import { db } from "@/lib/db";
import { clientKeywords } from "@/lib/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";

/**
 * The top active scraped keywords for a client, best-ranked first — merged into
 * the ideation keyword pool by getActiveKnowledgeForBlog so every generated post
 * targets them. Ranks by real search volume when a volume-bearing source has
 * populated it, otherwise by the Autocomplete popularity proxy (hitCount, then
 * best position). Fail-safe to [].
 */
export async function topActiveClientKeywords(
  clientId: string,
  limit = 40,
): Promise<string[]> {
  try {
    const rows = await db
      .select({ keyword: clientKeywords.keyword })
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
    return rows.map((r) => r.keyword);
  } catch {
    return [];
  }
}
