/**
 * lib/content/niche-config-db.ts
 *
 * Resolve a niche's generation config from the editable `niches` DB table
 * (Content Studio → Niches). Returns a ResolvedNiche the article prompt builder
 * consumes, or `undefined` when there's no active row — in which case the
 * generator falls back to the hardcoded code config (resolveCodeNiche). Any DB
 * error also falls back, so a bad/empty table can never break generation.
 *
 * This is the Phase-1b flip: generation reads niche voice/style/requirements
 * from the DB when a row exists, so ops edits in the admin screen take effect.
 */

import { db } from "@/lib/db";
import { niches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  normalizeNicheKey,
  type ResolvedNiche,
} from "@/lib/services/content-generator";

export async function resolveNicheConfig(
  niche: string | null | undefined,
): Promise<ResolvedNiche | undefined> {
  const key = normalizeNicheKey(niche);
  if (!key) return undefined;

  try {
    const [row] = await db
      .select()
      .from(niches)
      .where(eq(niches.key, key))
      .limit(1);

    if (!row || row.active === false) return undefined;

    return {
      label: row.label,
      industry: row.industry,
      defaultAudience: row.defaultAudience ?? "",
      defaultBrandVoice: row.defaultBrandVoice ?? "",
      contentStyle: row.contentStyle ?? "",
      keyTopics: Array.isArray(row.keyTopics) ? (row.keyTopics as string[]) : [],
      requirements: row.requirements ?? "",
    };
  } catch (err) {
    console.warn(
      "[niche-config] DB resolve failed, falling back to code config:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}
