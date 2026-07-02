"use server";

import { db } from "@/lib/db";
import { niches } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  exportNicheSeedData,
  normalizeNicheKey,
  renderSystemPrompt,
  resolveCodeNiche,
  type GenerateOptions,
  type ResolvedNiche,
} from "@/lib/services/content-generator";
import { convertToMarkdown } from "@/lib/services/knowledge-converter";
import { extractNicheConfig } from "@/lib/services/niche-extractor";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB

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

/** Fallback slug for a niche key when the model gives none. */
function slugKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

/**
 * Import a niche config from an uploaded reference file: convert to Markdown,
 * AI-extract the config, and upsert a niches row (source="imported") for the
 * operator to review and edit. Replaces the manual "read the file, hand-code the
 * rules" step. Returns the niche id so the UI can jump straight to its editor.
 */
export async function importNicheFromFile(formData: FormData): Promise<{
  success: boolean;
  message: string;
  nicheId?: string;
  key?: string;
  replaced?: boolean;
}> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, message: "No file provided." };
  if (file.size === 0) return { success: false, message: "The file is empty." };
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      success: false,
      message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
    };
  }

  let markdown: string;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const conversion = await convertToMarkdown(buf, file.type || "", file.name);
    markdown = conversion.markdown;
  } catch (err) {
    return {
      success: false,
      message: `Could not read the file: ${err instanceof Error ? err.message : "conversion failed"}`,
    };
  }

  let draft;
  try {
    draft = await extractNicheConfig(markdown, { fileName: file.name });
  } catch (err) {
    return {
      success: false,
      message: `Extraction failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  const key =
    normalizeNicheKey(draft.suggestedKey) ||
    normalizeNicheKey(draft.label) ||
    slugKey(draft.label || file.name.replace(/\.[^.]+$/, "")) ||
    slugKey(file.name);
  if (!key) return { success: false, message: "Could not derive a niche key from the file." };
  if (!draft.label) draft.label = key;
  if (!draft.industry) draft.industry = draft.label;

  const existing = await db
    .select({ id: niches.id })
    .from(niches)
    .where(eq(niches.key, key))
    .limit(1);
  const replaced = existing.length > 0;

  const [row] = await db
    .insert(niches)
    .values({
      key,
      label: draft.label,
      industry: draft.industry,
      defaultAudience: draft.defaultAudience || null,
      defaultBrandVoice: draft.defaultBrandVoice || null,
      contentStyle: draft.contentStyle || null,
      keyTopics: draft.keyTopics,
      requirements: draft.requirements || null,
      disclaimers: draft.disclaimers,
      source: "imported",
    })
    .onConflictDoUpdate({
      target: niches.key,
      set: {
        label: draft.label,
        industry: draft.industry,
        defaultAudience: draft.defaultAudience || null,
        defaultBrandVoice: draft.defaultBrandVoice || null,
        contentStyle: draft.contentStyle || null,
        keyTopics: draft.keyTopics,
        requirements: draft.requirements || null,
        disclaimers: draft.disclaimers,
        source: "imported",
        updatedAt: new Date(),
      },
    })
    .returning({ id: niches.id, key: niches.key });

  revalidatePath("/content-studio/niches");
  return {
    success: true,
    nicheId: row.id,
    key: row.key,
    replaced,
    message: replaced
      ? `Updated niche "${row.key}" from ${file.name}. Review the draft below.`
      : `Created niche "${row.key}" from ${file.name}. Review the draft below.`,
  };
}

/** Deterministic sample options so the code-vs-DB prompts differ ONLY by the
 *  niche source (fixed seed → identical per-blog quirks/word band on both). */
function sampleOptions(nicheKey: string): GenerateOptions {
  return {
    topic: "(sample topic for preview)",
    keywords: ["sample", "keyword"],
    wordCount: 1000,
    tone: "professional",
    niche: nicheKey,
    blogSeed: `preview:${nicheKey}`,
  };
}

function rowToResolvedNiche(row: NicheRow): ResolvedNiche {
  return {
    label: row.label,
    industry: row.industry,
    defaultAudience: row.defaultAudience ?? "",
    defaultBrandVoice: row.defaultBrandVoice ?? "",
    contentStyle: row.contentStyle ?? "",
    keyTopics: Array.isArray(row.keyTopics) ? (row.keyTopics as string[]) : [],
    requirements: row.requirements ?? "",
    disclaimers: Array.isArray(row.disclaimers)
      ? (row.disclaimers as string[])
      : [],
  };
}

/**
 * Parity preview: render the article system prompt for this niche BOTH ways —
 * from the current code config and from the DB row — using identical sample
 * options. When `identical` is true, switching generation to the DB is a
 * provable no-op. When the row has been hand-edited, the diff shows exactly how
 * the generated prompt would change.
 */
export async function previewNichePrompt(id: string): Promise<{
  success: boolean;
  message?: string;
  nicheKey?: string;
  fromCode?: string;
  fromDb?: string;
  identical?: boolean;
}> {
  await requireAdmin();
  const [row] = await db.select().from(niches).where(eq(niches.id, id)).limit(1);
  if (!row) return { success: false, message: "Niche not found" };

  const opts = sampleOptions(row.key);
  const fromCode = renderSystemPrompt(opts, resolveCodeNiche(row.key));
  const fromDb = renderSystemPrompt(opts, rowToResolvedNiche(row));

  return {
    success: true,
    nicheKey: row.key,
    fromCode,
    fromDb,
    identical: fromCode === fromDb,
  };
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
