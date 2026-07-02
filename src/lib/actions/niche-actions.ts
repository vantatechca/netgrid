"use server";

import { db } from "@/lib/db";
import { niches } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/helpers";
import { exportNicheSeedData } from "@/lib/services/content-generator";

export type NicheRow = typeof niches.$inferSelect;

/** All niche config rows, alphabetical by label. */
export async function getNiches(): Promise<NicheRow[]> {
  await requireAdmin();
  return db.select().from(niches).orderBy(asc(niches.label));
}

/** One niche config row by id. */
export async function getNicheById(id: string): Promise<NicheRow | null> {
  await requireAdmin();
  const [row] = await db.select().from(niches).where(eq(niches.id, id)).limit(1);
  return row ?? null;
}

export interface NichePatch {
  label?: string;
  industry?: string;
  defaultAudience?: string | null;
  defaultBrandVoice?: string | null;
  contentStyle?: string | null;
  keyTopics?: string[];
  requirements?: string | null;
  disclaimers?: string[];
  wordBandMin?: number | null;
  wordBandMax?: number | null;
  active?: boolean;
}

/**
 * Edit a niche row. Marks it source="manual" so a later "Sync from code" won't
 * clobber the hand-edited values.
 */
export async function updateNiche(
  id: string,
  patch: NichePatch,
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  const [existing] = await db
    .select({ id: niches.id })
    .from(niches)
    .where(eq(niches.id, id))
    .limit(1);
  if (!existing) return { success: false, message: "Niche not found" };

  await db
    .update(niches)
    .set({
      ...patch,
      source: "manual",
      updatedAt: new Date(),
    })
    .where(eq(niches.id, id));

  revalidatePath("/content-studio/niches");
  revalidatePath(`/content-studio/niches/${id}`);
  return { success: true, message: "Niche saved" };
}

/**
 * Seed the niches table from the hardcoded code config (byte-identical to what
 * generation uses today). Inserts rows for keys that don't exist yet and does
 * NOT overwrite existing rows — so hand-edited ("manual") niches are preserved
 * and re-running is safe. This is the Phase-0 "review the migrated rows" step:
 * generation is untouched; these rows are a shadow copy for the editor.
 */
export async function syncNichesFromCode(): Promise<{
  success: boolean;
  inserted: number;
  total: number;
  message: string;
}> {
  await requireAdmin();

  const seed = exportNicheSeedData();
  const existing = await db.select({ key: niches.key }).from(niches);
  const have = new Set(existing.map((r) => r.key));

  const toInsert = seed.filter((s) => !have.has(s.key));
  if (toInsert.length > 0) {
    await db.insert(niches).values(
      toInsert.map((s) => ({
        key: s.key,
        label: s.label,
        industry: s.industry,
        defaultAudience: s.defaultAudience,
        defaultBrandVoice: s.defaultBrandVoice,
        contentStyle: s.contentStyle,
        keyTopics: s.keyTopics,
        requirements: s.requirements || null,
        disclaimers: [] as string[],
        source: "seed" as const,
      })),
    );
  }

  revalidatePath("/content-studio/niches");
  return {
    success: true,
    inserted: toInsert.length,
    total: seed.length,
    message:
      toInsert.length === 0
        ? "Already in sync — every code niche has a row."
        : `Seeded ${toInsert.length} niche${toInsert.length === 1 ? "" : "s"} from code.`,
  };
}
