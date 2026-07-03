"use server";

import { db } from "@/lib/db";
import { styleProfiles, blogs, clients } from "@/lib/db/schema";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/helpers";
import {
  generateBlogPersona,
  type GeneratedPersona,
} from "@/lib/content/persona-generator";
import {
  assignProfile,
  buildNetworkState,
  pickCompounds,
  allowedCompoundsForSubNiche,
} from "@/lib/content/assignment/algorithm";
import { SeededRng } from "@/lib/content/assignment/draw-helpers";
import {
  getCachedNicheProfile,
  loadNicheProfiles,
} from "@/lib/content/niche-registry";
import { PEPTIDE_COMPOUNDS } from "@/lib/content/libraries/compounds";
import { NICHES, UNIVERSAL_NICHE_KEY, PEPTIDES_NICHE_KEY, nicheConfig } from "@/lib/content/libraries/niches";
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
    generatedPersona:
      (row.generatedPersona as StyleProfile["generatedPersona"]) ?? null,
    generatedPersonaSeed: row.generatedPersonaSeed ?? null,
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

/**
 * Generate (or regenerate) an LLM persona for a blog and store it on its style
 * profile. Ensures a profile row exists first, gathers the personas already in
 * use for the same niche so the new one is distinct, and honors optional
 * operator seed direction. When set, composeForPost uses this persona for the
 * voice slots instead of the library voice.
 */
export async function generatePersonaForBlog(
  blogId: string,
  seedInputs?: string,
): Promise<{ success: boolean; message: string; label?: string }> {
  await requireAdmin();

  let profile = await getStyleProfileForBlog(blogId);
  if (!profile) {
    await assignProfileForBlog(blogId);
    profile = await getStyleProfileForBlog(blogId);
  }
  if (!profile) {
    return { success: false, message: "No style profile for this blog yet." };
  }

  const [blogRow] = await db
    .select({ niche: clients.niche, clientName: clients.name })
    .from(blogs)
    .leftJoin(clients, eq(blogs.clientId, clients.id))
    .where(eq(blogs.id, blogId))
    .limit(1);
  const nicheLabel = blogRow?.niche || profile.nicheKey || "general";

  // Personas already in use for this niche (excluding this blog) — for diversity.
  const existingRows = await db
    .select({ gp: styleProfiles.generatedPersona })
    .from(styleProfiles)
    .where(
      and(
        eq(styleProfiles.nicheKey, profile.nicheKey),
        isNotNull(styleProfiles.generatedPersona),
        ne(styleProfiles.blogId, blogId),
      ),
    )
    .limit(20);
  const existingPersonas = existingRows
    .map((r) => (r.gp as GeneratedPersona | null)?.persona)
    .filter((s): s is string => !!s);

  const seed = seedInputs?.trim() || profile.generatedPersonaSeed || undefined;
  const persona = await generateBlogPersona({
    nicheLabel,
    clientName: blogRow?.clientName ?? undefined,
    seedInputs: seed,
    existingPersonas,
  });
  if (!persona) {
    return { success: false, message: "Persona generation failed — try again." };
  }

  await db
    .update(styleProfiles)
    .set({ generatedPersona: persona, generatedPersonaSeed: seed ?? null })
    .where(eq(styleProfiles.blogId, blogId));

  revalidatePath(`/blogs/${blogId}`);
  return {
    success: true,
    message: persona.label
      ? `Persona generated: ${persona.label}`
      : "Persona generated.",
    label: persona.label,
  };
}

/** Clear a blog's generated persona — reverts to the library voice. */
export async function clearBlogPersona(
  blogId: string,
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();
  await db
    .update(styleProfiles)
    .set({ generatedPersona: null })
    .where(eq(styleProfiles.blogId, blogId));
  revalidatePath(`/blogs/${blogId}`);
  return { success: true, message: "Reverted to the library voice." };
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

    // Auto-generated niche profile: when the client niche isn't hardcoded but
    // has a generated profile (created on client-create), the algorithm ran on
    // the universal niche and left the compound pools empty. Fill them with the
    // generated niche's topic terms (seeded → deterministic) so the prompt gets
    // real, on-topic vocabulary instead of nothing.
    await loadNicheProfiles();
    const generatedNiche = getCachedNicheProfile(normalizedNiche);
    if (generatedNiche && profile.primaryCompounds.length === 0) {
      const rng = new SeededRng(`${profile.assignmentSeed ?? blogId}:niche-terms`);
      const primary = rng.shuffle([...generatedNiche.primaryTerms]).slice(0, 2);
      const secondaryPool = [
        ...generatedNiche.adjacentTerms,
        ...generatedNiche.primaryTerms,
      ].filter((t) => !primary.includes(t));
      const secondary = rng.shuffle(secondaryPool).slice(0, 4);
      profile.primaryCompounds = primary;
      profile.secondaryCompounds = secondary.length > 0 ? secondary : primary;
    }

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

/**
 * Network-wide repair: rewrite primary/secondary compounds for ANY profile —
 * peptide or otherwise — whose stored compounds drifted off its niche. This
 * fixes the pre-fix bug where the per-niche sub-divisions (sub-niche IDs
 * 34-90) had no direct canon entry and fell through to a broad ALL_COMPOUNDS
 * draw, so a roofing/loans/gambling blog could end up tagged with unrelated
 * terms like "TypeScript" or "NFL betting".
 *
 * For each profile:
 *   - Niches without a subject canon (the universal fallback) should carry NO
 *     compounds — any stored ones are cleared.
 *   - Otherwise, if every stored compound is on-topic for the sub-niche, the
 *     row is left untouched (idempotent — safe to re-run).
 *   - Any contaminated row is recomputed via the now canon-correct
 *     pickCompounds. Only the two compound arrays change; voice, skeleton,
 *     cadence, quirks, word band, everything else is preserved.
 */
export async function repairProfileCompounds(): Promise<{
  scanned: number;
  repaired: number;
  cleared: number;
  sample: string[];
}> {
  const rows = await db.select().from(styleProfiles);

  let repaired = 0;
  let cleared = 0;
  const sample: string[] = [];

  for (const row of rows) {
    const stored = [
      ...(row.primaryCompounds ?? []),
      ...(row.secondaryCompounds ?? []),
    ];

    // Niches with no curated subject canon (universal fallback) must carry no
    // compounds. Clear any leftovers from the old broad-draw behaviour.
    const niche = nicheConfig(row.nicheKey);
    if (niche && !niche.useSubjectCanon) {
      if (stored.length > 0) {
        await db
          .update(styleProfiles)
          .set({ primaryCompounds: [], secondaryCompounds: [] })
          .where(eq(styleProfiles.blogId, row.blogId));
        cleared++;
      }
      continue;
    }

    const allowed = allowedCompoundsForSubNiche(row.subNicheId as SubNicheId);
    // Already on-topic — every stored compound belongs to this niche.
    if (stored.length > 0 && stored.every((c) => allowed.has(c))) continue;

    const rng = new SeededRng(`${row.assignmentSeed ?? row.blogId}:compounds:v2`);
    const { primary, secondary } = pickCompounds(rng, row.subNicheId as SubNicheId);

    await db
      .update(styleProfiles)
      .set({ primaryCompounds: primary, secondaryCompounds: secondary })
      .where(eq(styleProfiles.blogId, row.blogId));

    if (sample.length < 8) {
      sample.push(
        `${row.blogId} [${row.nicheKey} / sub ${row.subNicheId}]: ${primary.join("+")} / ${secondary.join(", ")}`,
      );
    }
    repaired++;
  }

  return { scanned: rows.length, repaired, cleared, sample };
}