"use server";

import { db } from "@/lib/db";
import { styleProfiles, blogs, clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  assignProfile,
  buildNetworkState,
  pickCompounds,
} from "@/lib/content/assignment/algorithm";
import { SeededRng } from "@/lib/content/assignment/draw-helpers";
import { PEPTIDE_COMPOUNDS } from "@/lib/content/libraries/compounds";
import { NICHES, UNIVERSAL_NICHE_KEY, PEPTIDES_NICHE_KEY } from "@/lib/content/libraries/niches";
import type {
  CompliancePhraseId,
  QuirkId,
  StyleProfile,
  SubNicheId,
  TemplateId,
} from "@/lib/content/types";
import { normalizeNicheKey } from "@/lib/services/content-generator";


/**
 * Convert a DB row → in-memory StyleProfile shape. Array fields come back as
 * unknown[] from pg in some cases, so we cast through number[].
 */
function rowToProfile(row: typeof styleProfiles.$inferSelect): StyleProfile {
  return {
    blogId: row.blogId,
    nicheKey: row.nicheKey,
    subNicheId: row.subNicheId as StyleProfile["subNicheId"],
    voiceId: row.voiceId,
    skeletonId: row.skeletonId as StyleProfile["skeletonId"],
    cadenceId: row.cadenceId as StyleProfile["cadenceId"],
    quirks: (row.quirks ?? []) as QuirkId[],
    schemaId: row.schemaId as StyleProfile["schemaId"],
    tagSetId: row.tagSetId as StyleProfile["tagSetId"],
    citationStyleId: row.citationStyleId as StyleProfile["citationStyleId"],
    structuralPool: (row.structuralPool ?? []) as TemplateId[],
    compliancePhraseIds: (row.compliancePhraseIds ?? []) as CompliancePhraseId[],
    compliancePlacement: row.compliancePlacement,
    wordBandMin: row.wordBandMin,
    wordBandMax: row.wordBandMax,
    scrubberStrictness: row.scrubberStrictness,
    primaryCompounds: row.primaryCompounds ?? [],
    secondaryCompounds: row.secondaryCompounds ?? [],
    assignmentSeed: row.assignmentSeed ?? undefined,
    // Drizzle returns decimal columns as strings; coerce back to number
    // so the StyleProfile type stays clean and consumers (UI, scrubber)
    // can do numeric comparisons without re-parsing.
    minHammingAtAssign:
      row.minHammingAtAssign != null
        ? Number(row.minHammingAtAssign)
        : undefined,
  };
}

/**
 * Loads the network of existing style profiles (peptide niche only).
 * Returned shape is the lightweight StyleProfile, suitable for feeding into
 * the assignment algorithm.
 */
/**
 * Loads the existing style profiles in the same niche as the target blog —
 * the algorithm uses these for Hamming-distance reroll within the niche.
 * Cross-niche profiles don't compete for uniqueness, so we scope the query
 * to a single niche.
 */
async function loadNetworkForNiche(nicheKey: string): Promise<StyleProfile[]> {
  const rows = await db
    .select()
    .from(styleProfiles)
    .where(eq(styleProfiles.nicheKey, nicheKey));
  return rows.map(rowToProfile);
}

/**
 * Returns the style profile for a blog if one exists, else null. Used by the
 * composer and the blog detail page.
 */
export async function getStyleProfileForBlog(
  blogId: string,
): Promise<StyleProfile | null> {
  const [row] = await db
    .select()
    .from(styleProfiles)
    .where(eq(styleProfiles.blogId, blogId))
    .limit(1);
  if (!row) return null;
  return rowToProfile(row);
}

export interface AssignProfileResult {
  success: boolean;
  assigned: boolean; // false if niche didn't qualify
  message?: string;
  profile?: StyleProfile;
}

/**
 * Assign a style profile for a blog based on its client's niche. Idempotent —
 * does nothing if a profile already exists. Returns success=true,
 * assigned=false when the niche isn't registered in niches.ts.
 *
 * Works for any niche listed in NICHES (peptides + 11 others). Each niche
 * has its own voice pool, sub-niches, and compliance config; the algorithm
 * picks within that scope.
 *
 * Called immediately after blog insert and lazily on first generate for
 * pre-existing blogs. Failures are non-fatal — we log and return
 * success=false rather than rolling back the blog insert.
 */
export async function assignProfileForBlog(
  blogId: string,
): Promise<AssignProfileResult> {
  try {
    // Already assigned?
    const existing = await db
      .select({ id: styleProfiles.id })
      .from(styleProfiles)
      .where(eq(styleProfiles.blogId, blogId))
      .limit(1);
    if (existing.length > 0) {
      return { success: true, assigned: false, message: "Profile already exists" };
    }

    // Look up the blog's client niche
    const [blogRow] = await db
      .select({
        id: blogs.id,
        clientNiche: clients.niche,
      })
      .from(blogs)
      .leftJoin(clients, eq(blogs.clientId, clients.id))
      .where(eq(blogs.id, blogId))
      .limit(1);

    if (!blogRow) {
      return { success: false, assigned: false, message: "Blog not found" };
    }

    // Resolve the niche key. Order:
    //   1. Normalised client.niche if it's in the NICHES registry
    //   2. Otherwise UNIVERSAL_NICHE_KEY (catches anything — gym marketing,
    //      real estate, dental practice, etc.). The blog's actual niche
    //      string is still passed downstream as nicheLabel so the prompt
    //      and image generator have topical context.
    const normalizedNiche = normalizeNicheKey(blogRow.clientNiche);
    const nicheKey =
      normalizedNiche && NICHES[normalizedNiche]
        ? normalizedNiche
        : UNIVERSAL_NICHE_KEY;

    // Load network in the same niche (Hamming uniqueness only applies
    // within a niche) and run the algorithm.
    const network = await loadNetworkForNiche(nicheKey);
    const ns = buildNetworkState(network);
    const profile = assignProfile(blogId, ns, { nicheKey });

    // Persist
    await db.insert(styleProfiles).values({
      blogId: profile.blogId,
      nicheKey: profile.nicheKey,
      subNicheId: profile.subNicheId,
      voiceId: profile.voiceId,
      skeletonId: profile.skeletonId,
      cadenceId: profile.cadenceId,
      quirks: profile.quirks as number[],
      schemaId: profile.schemaId,
      tagSetId: profile.tagSetId,
      citationStyleId: profile.citationStyleId,
      structuralPool: profile.structuralPool as number[],
      compliancePhraseIds: profile.compliancePhraseIds as number[],
      compliancePlacement: profile.compliancePlacement,
      wordBandMin: profile.wordBandMin,
      wordBandMax: profile.wordBandMax,
      scrubberStrictness: profile.scrubberStrictness,
      primaryCompounds: profile.primaryCompounds,
      secondaryCompounds: profile.secondaryCompounds,
      assignmentSeed: profile.assignmentSeed,
      // Drizzle's decimal column expects a string at insert time —
      // matches the existing costUsd pattern in blog-actions.ts.
      minHammingAtAssign:
        profile.minHammingAtAssign !== undefined &&
        Number.isFinite(profile.minHammingAtAssign)
          ? profile.minHammingAtAssign.toFixed(2)
          : null,
    });

    return { success: true, assigned: true, profile };
  } catch (err) {
    console.error("assignProfileForBlog failed:", err);
    return {
      success: false,
      assigned: false,
      message: err instanceof Error ? err.message : "Profile assignment failed",
    };
  }
}

/**
 * Backwards-compatible alias for the old name. New callers should use
 * assignProfileForBlog (it's no longer peptide-specific).
 */
export async function assignProfileForBlogIfPeptides(
  blogId: string,
): Promise<AssignProfileResult> {
  return assignProfileForBlog(blogId);
}

/**
 * Force-reassign a profile (admin tool). Deletes any existing profile and
 * runs the algorithm fresh. Useful when the libraries change or an admin
 * wants to re-roll.
 */
export async function reassignProfile(
  blogId: string,
): Promise<AssignProfileResult> {
  try {
    await db.delete(styleProfiles).where(eq(styleProfiles.blogId, blogId));
    return assignProfileForBlogIfPeptides(blogId);
  } catch (err) {
    console.error("reassignProfile failed:", err);
    return {
      success: false,
      assigned: false,
      message: err instanceof Error ? err.message : "Reassignment failed",
    };
  }
}
/**
 * One-time repair: rewrite primary/secondary compounds for any peptide
 * profile that contains a non-peptide term (TypeScript, insurance claim,
 * etc.) leaked from the old ALL_COMPOUNDS pool. Regenerates ONLY the two
 * compound arrays via the now peptide-scoped pickCompounds — voice,
 * skeleton, cadence, quirks, everything else is left untouched.
 * Idempotent: a clean row is skipped, so it's safe to re-run.
 */
export async function repairPeptideCompounds(): Promise<{
  scanned: number;
  repaired: number;
  sample: string[];
}> {
  const peptideSet = new Set<string>(PEPTIDE_COMPOUNDS);
  const rows = await db
    .select()
    .from(styleProfiles)
    .where(eq(styleProfiles.nicheKey, PEPTIDES_NICHE_KEY));

  let repaired = 0;
  const sample: string[] = [];

  for (const row of rows) {
    const all = [
      ...(row.primaryCompounds ?? []),
      ...(row.secondaryCompounds ?? []),
    ];
    // Already clean — every stored compound is a real peptide term.
    if (all.length > 0 && all.every((c) => peptideSet.has(c))) continue;

    const rng = new SeededRng(`${row.assignmentSeed ?? row.blogId}:compounds:v2`);
    const { primary, secondary } = pickCompounds(rng, row.subNicheId as SubNicheId);

    await db
      .update(styleProfiles)
      .set({ primaryCompounds: primary, secondaryCompounds: secondary })
      .where(eq(styleProfiles.blogId, row.blogId));

    if (sample.length < 8) {
      sample.push(`${row.blogId} (sub ${row.subNicheId}): ${primary.join("+")} / ${secondary.join(", ")}`);
    }
    repaired++;
  }

  return { scanned: rows.length, repaired, sample };
}
