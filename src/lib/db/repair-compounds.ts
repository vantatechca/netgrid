/**
 * One-shot repair for existing style profiles.
 *
 * Fixes two things on already-assigned blogs (new blogs are already correct
 * after the algorithm fix):
 *
 *   1. Word band → tightens every profile to [GLOBAL_WORD_BAND_MIN,
 *      GLOBAL_WORD_BAND_MAX] (800–1000). Shorter posts = lower Claude cost.
 *   2. Compounds → rewrites primary/secondary compounds for any profile whose
 *      stored terms drifted off its niche. The pre-fix bug let per-niche
 *      sub-divisions (sub-niche IDs 34-90) fall through to a broad ALL_COMPOUNDS
 *      draw, so e.g. a roofing or loans blog could be tagged with "TypeScript"
 *      or "NFL betting". Universal-niche profiles (no subject canon) are
 *      cleared to empty.
 *
 * Run from project root (DATABASE_URL must be set, e.g. via .env):
 *   npx tsx src/lib/db/repair-compounds.ts
 *
 * Idempotent — clean rows are skipped, so it's safe to re-run.
 */

import { eq, ne, or } from "drizzle-orm";
import { db } from "./index";
import { styleProfiles } from "./schema";
import {
  pickCompounds,
  allowedCompoundsForSubNiche,
} from "../content/assignment/algorithm";
import { nicheConfig } from "../content/libraries/niches";
import { SeededRng } from "../content/assignment/draw-helpers";
import {
  GLOBAL_WORD_BAND_MIN,
  GLOBAL_WORD_BAND_MAX,
} from "../content/config";
import type { SubNicheId } from "../content/types";

async function repairWordBands(): Promise<number> {
  const result = await db
    .update(styleProfiles)
    .set({
      wordBandMin: GLOBAL_WORD_BAND_MIN,
      wordBandMax: GLOBAL_WORD_BAND_MAX,
    })
    .where(
      or(
        ne(styleProfiles.wordBandMin, GLOBAL_WORD_BAND_MIN),
        ne(styleProfiles.wordBandMax, GLOBAL_WORD_BAND_MAX),
      ),
    )
    .returning({ blogId: styleProfiles.blogId });
  return result.length;
}

async function repairCompounds(): Promise<{
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

async function main() {
  console.log("Repairing style profiles…\n");

  const bands = await repairWordBands();
  console.log(`Word band: ${bands} profile(s) set to ${GLOBAL_WORD_BAND_MIN}-${GLOBAL_WORD_BAND_MAX}.`);

  const c = await repairCompounds();
  console.log(
    `Compounds: scanned ${c.scanned}, rewrote ${c.repaired}, cleared ${c.cleared}.`,
  );
  if (c.sample.length > 0) {
    console.log("\nSample of rewritten profiles:");
    for (const s of c.sample) console.log(`  ${s}`);
  }
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Repair failed:", err);
    process.exit(1);
  });
