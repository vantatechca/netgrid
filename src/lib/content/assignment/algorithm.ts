import type {
  ArchetypeId,
  CadenceId,
  CitationStyleId,
  CompliancePhraseId,
  CompliancePlacement,
  NetworkState,
  QuirkId,
  ScrubberStrictness,
  SchemaId,
  SkeletonId,
  StructuralTemplate,
  StyleProfile,
  SubNicheId,
  TagSetId,
  TemplateId,
  Voice,
  VoiceId,
} from "../types";
import { archetypeForVoice } from "../libraries/archetypes";
import { nicheConfig, PEPTIDES_NICHE_KEY, type NicheConfig } from "../libraries/niches";
import { GLOBAL_WORD_BAND_MAX, GLOBAL_WORD_BAND_MIN } from "../config";
import { CADENCE_IDS, EXTENDED_CADENCE_IDS } from "../libraries/cadences";
import { CITATION_STYLE_IDS } from "../libraries/citation-styles";
import {
  COMPLIANCE_PHRASES,
  COMPLIANCE_PHRASE_IDS,
  PLACEMENT_DISTRIBUTION,
} from "../libraries/compliance-phrases";
import { canonForSubNiche, ALL_COMPOUNDS, GLP1_COMPOUNDS } from "../libraries/compounds";
import {
  defaultStrictness,
  isSkeletonCompatibleWithCadence,
  isSkeletonCompatibleWithStrictness,
  isSkeletonCompatibleWithSubNiche,
  isSkeletonCompatibleWithVoice,
  schemaBiasForVoice,
} from "../libraries/compatibility";
import { SCHEMA_IDS } from "../libraries/schemas";
import { SKELETON_IDS } from "../libraries/skeletons";
import { SUB_NICHES, SUB_NICHE_IDS } from "../libraries/sub-niches";
import {
  TAG_SETS,
  TAG_SET_DISTRIBUTION,
  TAG_SET_IDS,
} from "../libraries/tag-sets";
import {
  SUB_NICHE_TAG_SET_OVERRIDES,
  TAG_SET_EXCLUDED_FOR_CADENCE,
  TEMPLATES,
  TEMPLATE_IDS,
  WEIRD_IDS,
  WORD_BANDS,
  WORKHORSE_IDS,
  wordBandForTier,
} from "../libraries/templates";
import { QUIRK_IDS, quirksByCategory, quirksConflict } from "../libraries/quirks";
import { VOICES, VOICE_IDS, voicesForSubNiche } from "../libraries/voices";
import {
  SeededRng,
  balancedSample,
  pickN,
  weightedSample,
} from "./draw-helpers";
import {
  MIN_HAMMING_REQUIRED,
  closestNeighbour,
  hammingDistance,
  minHammingToNetwork,
} from "./diversity";

const PLACEMENT_VALUES: CompliancePlacement[] = [
  "TOP",
  "BOTTOM",
  "TOP_AND_BOTTOM",
  "INLINE",
  "ABOUT_ONLY",
  "ROTATING",
];

/**
 * Empty network state — useful for the very first blog or for tests.
 */
export function emptyNetworkState(): NetworkState {
  return {
    allProfiles: [],
    subNicheUsage: new Map(),
    voiceUsage: new Map(),
    skeletonUsage: new Map(),
    cadenceUsage: new Map(),
    cadenceUsageInSubNiche: new Map(),
    tagSetUsage: new Map(),
    schemaUsage: new Map(),
    citationStyleUsage: new Map(),
    quirkPairUsage: new Map(),
    compliancePhraseUsage: new Map(),
    placementUsage: new Map(),
    compoundUsage: new Map(),
  };
}

/**
 * Build a NetworkState from a list of existing profiles. O(n) in the network
 * size — fine up to network sizes well past 2000.
 */
export function buildNetworkState(profiles: StyleProfile[]): NetworkState {
  const ns = emptyNetworkState();
  ns.allProfiles = profiles;
  for (const p of profiles) {
    bumpProfile(ns, p);
  }
  return ns;
}

function bumpProfile(ns: NetworkState, p: StyleProfile): void {
  inc(ns.subNicheUsage, p.subNicheId);
  inc(ns.voiceUsage, p.voiceId);
  inc(ns.skeletonUsage, p.skeletonId);
  inc(ns.cadenceUsage, p.cadenceId);
  const sub = ns.cadenceUsageInSubNiche.get(p.subNicheId) ?? new Map<CadenceId, number>();
  inc(sub, p.cadenceId);
  ns.cadenceUsageInSubNiche.set(p.subNicheId, sub);

  inc(ns.tagSetUsage, p.tagSetId);
  inc(ns.schemaUsage, p.schemaId);
  inc(ns.citationStyleUsage, p.citationStyleId);

  // Pair counts for quirks
  const sortedQuirks = [...p.quirks].sort((a, b) => a - b);
  for (let i = 0; i < sortedQuirks.length; i++) {
    for (let j = i + 1; j < sortedQuirks.length; j++) {
      const key = `${sortedQuirks[i]},${sortedQuirks[j]}`;
      ns.quirkPairUsage.set(key, (ns.quirkPairUsage.get(key) ?? 0) + 1);
    }
  }

  for (const id of p.compliancePhraseIds) inc(ns.compliancePhraseUsage, id);
  inc(ns.placementUsage, p.compliancePlacement);

  for (const c of [...p.primaryCompounds, ...p.secondaryCompounds]) {
    ns.compoundUsage.set(c, (ns.compoundUsage.get(c) ?? 0) + 1);
  }
}

function inc<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function get<K>(map: Map<K, number>, key: K): number {
  return map.get(key) ?? 0;
}

// ─── Phase 1: Sub-niche ────────────────────────────────────────────────────

function pickSubNiche(
  rng: SeededRng,
  ns: NetworkState,
  niche: NicheConfig,
): SubNicheId {
  // Single sub-niche → no choice to make.
  if (niche.subNicheIds.length === 1) {
    return niche.subNicheIds[0];
  }

  // Non-peptide niches carry several sub-niches all at targetPct 0 (they're
  // outside the 2000-blog peptide distribution). The target-weighting below
  // would zero out and fall back to a pure random pick, clustering blogs
  // unevenly. Spread them with a usage-balanced uniform draw instead so a
  // niche's blogs fan out across all its topical sub-divisions.
  const hasTargets = niche.subNicheIds.some((id) => SUB_NICHES[id].targetPct > 0);
  if (!hasTargets) {
    const ids = niche.subNicheIds;
    const weights = ids.map(() => 1);
    const usages = ids.map((id) => get(ns.subNicheUsage, id));
    const chosen = balancedSample(rng, ids, weights, usages, 0.7);
    return chosen ?? rng.pick(ids);
  }

  const total = ns.allProfiles.length;
  const weights: number[] = [];
  const ids: SubNicheId[] = [];

  for (const id of niche.subNicheIds) {
    const target = SUB_NICHES[id].targetPct / 100;
    const expectedSoFar = target * total;
    const actual = get(ns.subNicheUsage, id);
    const ratio = expectedSoFar > 0 ? actual / expectedSoFar : 0;
    const weight = ratio > 1.05 ? target * 0.2 : target * (2 - Math.min(ratio, 1));
    weights.push(weight);
    ids.push(id);
  }

  const chosen = weightedSample(rng, ids, weights);
  if (chosen === undefined) {
    return rng.pick(niche.subNicheIds);
  }
  return chosen;
}

// ─── Phase 2: Voice ────────────────────────────────────────────────────────

function pickVoice(
  rng: SeededRng,
  ns: NetworkState,
  subNiche: SubNicheId,
  niche: NicheConfig,
): VoiceId {
  // Intersect the niche's voice pool with the sub-niche-affinity voices.
  // For peptides: both lists are large and intersect on most voices.
  // For non-peptide: voice pool is the cross-niche set (V78-V92); the
  // intersection picks voices whose subNicheAffinity includes the chosen
  // non-peptide sub-niche.
  const nichePool = new Set(niche.voiceIds);
  const subNicheVoices = voicesForSubNiche(subNiche).filter((v) => nichePool.has(v.id));

  const candidates = subNicheVoices.length > 0
    ? subNicheVoices
    : VOICE_IDS.filter((id) => nichePool.has(id)).map((id) => VOICES[id]);

  if (candidates.length === 0) {
    return rng.pick(VOICE_IDS);
  }
  const items = candidates.map((v) => v.id);
  const weights = items.map(() => 1);
  const usages = items.map((id) => get(ns.voiceUsage, id));
  const chosen = balancedSample(rng, items, weights, usages, 0.6);
  return chosen ?? items[0];
}

// ─── Phase 3: Skeleton ─────────────────────────────────────────────────────

function pickSkeleton(
  rng: SeededRng,
  ns: NetworkState,
  voiceId: VoiceId,
): SkeletonId {
  const eligible = SKELETON_IDS.filter((id) =>
    isSkeletonCompatibleWithVoice(id, voiceId),
  );
  if (eligible.length === 0) {
    // No compatible skeleton — fall back to S9 (the universal-fit skeleton).
    return 9;
  }
  const weights = eligible.map(() => 1);
  const usages = eligible.map((id) => get(ns.skeletonUsage, id));
  const chosen = balancedSample(rng, eligible, weights, usages, 0.7);
  return chosen ?? eligible[0];
}

// ─── Phase 4: Cadence ──────────────────────────────────────────────────────

function pickCadence(
  rng: SeededRng,
  ns: NetworkState,
  voice: Voice,
  subNiche: SubNicheId,
): CadenceId {
  const base = voice.compatibleCadences.length > 0
    ? voice.compatibleCadences
    : CADENCE_IDS;
  // Non-peptide sub-niches (14+) also draw from the extended rhythm pool
  // (15-24) so cross-niche sites don't cluster on the 14 core cadences.
  // Peptide voices keep their hand-tuned 1-14 set untouched.
  const eligible = subNiche >= 14
    ? Array.from(new Set([...base, ...EXTENDED_CADENCE_IDS]))
    : base;
  const subNicheUsage = ns.cadenceUsageInSubNiche.get(subNiche) ?? new Map();
  const weights = eligible.map(() => 1);
  const usages = eligible.map((id) => subNicheUsage.get(id) ?? 0);
  const chosen = balancedSample(rng, eligible, weights, usages, 0.5);
  return chosen ?? eligible[0];
}

// ─── Phase 5: Tag set ──────────────────────────────────────────────────────

function pickTagSet(
  rng: SeededRng,
  voiceId: VoiceId,
  subNiche: SubNicheId,
  cadence: CadenceId,
): TagSetId {
  // Override stack — most specific wins
  const subOverride = SUB_NICHE_TAG_SET_OVERRIDES[subNiche];
  if (subOverride && subOverride.length > 0) {
    return rng.pick(subOverride);
  }

  const archetype = archetypeForVoice(voiceId);
  let eligible: TagSetId[] = [...TAG_SET_IDS];

  // Compounding pharmacy prefers technical sets
  if (archetype === 6) eligible = [4, 5];

  // Cadence-based exclusion
  const excluded = TAG_SET_EXCLUDED_FOR_CADENCE[cadence] ?? [];
  eligible = eligible.filter((id) => !excluded.includes(id));

  if (eligible.length === 0) eligible = [2]; // fallback to Standard

  const weights = eligible.map((id) => TAG_SET_DISTRIBUTION[id]);
  const chosen = weightedSample(rng, eligible, weights);
  return chosen ?? eligible[0];
}

// ─── Phase 6: Schema ───────────────────────────────────────────────────────

function pickSchema(rng: SeededRng, voiceId: VoiceId): SchemaId {
  // Baseline: the four core shapes (A-D) stay the most common; the extended
  // shapes (E-H) share the remaining mass so they appear without dominating.
  const CORE_WEIGHT = 0.16; // each of A-D
  const EXTENDED_WEIGHT = (1 - CORE_WEIGHT * 4) / 4; // each of E-H → 0.09
  const distribution: Partial<Record<SchemaId, number>> = {};
  for (const id of SCHEMA_IDS) {
    distribution[id] = id <= 4 ? CORE_WEIGHT : EXTENDED_WEIGHT;
  }

  const bias = schemaBiasForVoice(voiceId);
  if (bias !== null) {
    // Heavy bias toward the preferred schema (50%); spread the rest evenly.
    distribution[bias] = 0.5;
    const remaining = 0.5;
    const others = SCHEMA_IDS.filter((id) => id !== bias);
    for (const id of others) distribution[id] = remaining / others.length;
  }
  const weights = SCHEMA_IDS.map((id) => distribution[id] ?? 0);
  const chosen = weightedSample(rng, SCHEMA_IDS, weights);
  return chosen ?? 1;
}

// ─── Phase 7: Citation style ───────────────────────────────────────────────

function pickCitationStyle(
  rng: SeededRng,
  ns: NetworkState,
  voice: Voice,
): CitationStyleId {
  const eligible = voice.compatibleCitationStyles.length > 0
    ? voice.compatibleCitationStyles
    : CITATION_STYLE_IDS;
  const weights = eligible.map(() => 1);
  const usages = eligible.map((id) => get(ns.citationStyleUsage, id));
  const chosen = balancedSample(rng, eligible, weights, usages, 0.8);
  return chosen ?? eligible[0];
}

// ─── Phase 8: Quirks ───────────────────────────────────────────────────────

function pickQuirks(
  rng: SeededRng,
  ns: NetworkState,
  voice: Voice,
): QuirkId[] {
  const pool = voice.defaultQuirkPool.length > 0
    ? voice.defaultQuirkPool
    : QUIRK_IDS;

  const subtle = quirksByCategory("subtle");
  const highlyVisible = quirksByCategory("highly_visible");
  const networkSize = Math.max(ns.allProfiles.length, 1);
  const pairShareLimit = 0.05;

  const n = rng.intBetween(2, 3);
  const attempts = 30;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = rng.shuffle(pool);
    const picked: QuirkId[] = [];

    for (const q of shuffled) {
      if (picked.length >= n) break;
      // No conflicts
      if (picked.some((p) => quirksConflict(p, q))) continue;
      // Max one highly visible
      if (
        highlyVisible.includes(q) &&
        picked.some((p) => highlyVisible.includes(p))
      ) {
        continue;
      }
      picked.push(q);
    }

    if (picked.length < n) continue;

    // Must include at least one subtle quirk
    if (!picked.some((q) => subtle.includes(q))) continue;

    // Check network-share of pairs
    const sortedPicked = [...picked].sort((a, b) => a - b);
    let overShared = false;
    for (let i = 0; i < sortedPicked.length; i++) {
      for (let j = i + 1; j < sortedPicked.length; j++) {
        const key = `${sortedPicked[i]},${sortedPicked[j]}`;
        const count = ns.quirkPairUsage.get(key) ?? 0;
        if (count / networkSize > pairShareLimit) {
          overShared = true;
          break;
        }
      }
      if (overShared) break;
    }
    if (overShared) continue;

    return picked;
  }

  // Fallback — just pick from pool ignoring saturation constraint
  return pickN(rng, pool, Math.min(n, pool.length));
}

// ─── Phase 9: Structural pool ──────────────────────────────────────────────

function buildStructuralPool(
  rng: SeededRng,
  voiceId: VoiceId,
  subNiche: SubNicheId,
  tagSetId: TagSetId,
  cadence: CadenceId,
): TemplateId[] {
  const archetype = archetypeForVoice(voiceId);
  const tagSetAllowed = new Set(TAG_SETS[tagSetId].allowedTags);

  function isCompatible(t: StructuralTemplate): boolean {
    if (t.voiceArchetypeFit.length > 0 && !t.voiceArchetypeFit.includes(archetype)) {
      return false;
    }
    if (!t.subNicheFit.includes(subNiche)) return false;
    if (!t.tagSetFit.includes(tagSetId)) return false;
    return true;
  }

  let candidates = TEMPLATE_IDS.filter((id) => isCompatible(TEMPLATES[id]));
  if (candidates.length < 3) {
    // Open up — drop tag-set filter
    candidates = TEMPLATE_IDS.filter((id) => {
      const t = TEMPLATES[id];
      if (t.voiceArchetypeFit.length > 0 && !t.voiceArchetypeFit.includes(archetype)) return false;
      if (!t.subNicheFit.includes(subNiche)) return false;
      return true;
    });
  }
  if (candidates.length < 3) {
    // Last resort — just pick by sub-niche fit
    candidates = TEMPLATE_IDS.filter((id) => TEMPLATES[id].subNicheFit.includes(subNiche));
  }

  // Split candidates into workhorse vs weird so we can enforce 1-2 weird
  const cWorkhorse = candidates.filter((id) => WORKHORSE_IDS.includes(id));
  const cWeird = candidates.filter((id) => WEIRD_IDS.includes(id));

  const poolSize = rng.intBetween(3, 5);
  const weirdCount = Math.max(1, Math.min(2, cWeird.length));
  const workhorseCount = poolSize - weirdCount;

  const pickedWeird = cWeird.length > 0
    ? pickN(rng, cWeird, Math.min(weirdCount, cWeird.length))
    : [];
  const pickedWorkhorse = cWorkhorse.length > 0
    ? pickN(rng, cWorkhorse, Math.min(workhorseCount, cWorkhorse.length))
    : [];

  const pool = [...pickedWeird, ...pickedWorkhorse];

  // Ensure we have at least 3 templates — pad from whatever's left
  if (pool.length < 3) {
    const remaining = candidates.filter((id) => !pool.includes(id));
    while (pool.length < 3 && remaining.length > 0) {
      const idx = Math.floor(rng.next() * remaining.length);
      pool.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
  }

  return pool.sort((a, b) => a - b);
}

// ─── Phase 10: Compliance phrases + placement ──────────────────────────────

function pickCompliancePhrases(
  rng: SeededRng,
  ns: NetworkState,
  strictness: ScrubberStrictness,
  niche: NicheConfig,
): CompliancePhraseId[] {
  // If the niche doesn't use compliance phrases at all, return empty.
  // Composer renders that as "no compliance section" (graceful empty).
  if (!niche.useCompliancePhrases || niche.compliancePhraseIds.length === 0) {
    return [];
  }

  const allowedIds = new Set(niche.compliancePhraseIds);
  const eligible = COMPLIANCE_PHRASE_IDS.filter((id) => {
    if (!allowedIds.has(id)) return false;
    const phrase = COMPLIANCE_PHRASES[id];
    if (phrase.strictnessRequired && phrase.strictnessRequired !== strictness) {
      return false;
    }
    return true;
  });

  // For thin pools (e.g. gambling has 4 phrases), drop the syntactic-shape
  // constraint and just pick what's available.
  const n = Math.min(rng.intBetween(2, 3), eligible.length);
  if (eligible.length <= 4) {
    return pickN(rng, eligible, n);
  }

  const attempts = 20;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = rng.shuffle(eligible);
    const picked: CompliancePhraseId[] = [];
    const shapes = new Set<string>();

    for (const id of shuffled) {
      if (picked.length >= n) break;
      picked.push(id);
      shapes.add(COMPLIANCE_PHRASES[id].syntacticShape);
    }

    if (picked.length === n && shapes.size >= 2) return picked;
  }

  return pickN(rng, eligible, Math.min(n, eligible.length));
}

function pickPlacement(
  rng: SeededRng,
  ns: NetworkState,
  strictness: ScrubberStrictness,
): CompliancePlacement {
  const baseDist = { ...PLACEMENT_DISTRIBUTION };
  if (strictness === "strict") {
    // Strict tier biases toward TOP_AND_BOTTOM
    baseDist.TOP_AND_BOTTOM = 0.30;
    baseDist.ABOUT_ONLY = 0.05;
    baseDist.ROTATING = 0.05;
    baseDist.TOP = 0.20;
    baseDist.BOTTOM = 0.25;
    baseDist.INLINE = 0.15;
  }
  const weights = PLACEMENT_VALUES.map((p) => baseDist[p]);
  const chosen = weightedSample(rng, PLACEMENT_VALUES, weights);
  return chosen ?? "BOTTOM";
}

// ─── Phase 11: Word band ───────────────────────────────────────────────────

/**
 * Network-wide word-count policy. Every blog gets the same [min, max] band,
 * regardless of voice / cadence / template-pool tier. Change the two
 * constants in src/lib/services/content-generator.ts (GLOBAL_WORD_BAND_MIN
 * and GLOBAL_WORD_BAND_MAX) to shift the policy across all blogs.
 *
 * The cadence-aware / template-tier-aware logic that used to live here is
 * preserved as comments below — re-enable by deleting the override and
 * uncommenting the old body if a per-blog word band ever becomes desirable
 * again.
 */
function pickWordBand(
  _rng: SeededRng,
  _cadenceId: CadenceId,
  _pool: TemplateId[],
): [number, number] {
  return [GLOBAL_WORD_BAND_MIN, GLOBAL_WORD_BAND_MAX];

  // Previous tier-based logic (kept for reference):
  //
  // const tierCounts = new Map<string, number>();
  // for (const id of pool) {
  //   const tier = TEMPLATES[id].wordTier;
  //   tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
  // }
  // let dominant: string | null = null;
  // let max = 0;
  // for (const [tier, count] of tierCounts) {
  //   if (count > max) { max = count; dominant = tier; }
  // }
  //
  // const cadenceLeanLong = [5, 11];
  // const cadenceLeanShort = [3, 7, 13];
  // if (cadenceLeanLong.includes(cadenceId)) {
  //   if (dominant === "short") dominant = "short_medium";
  //   else if (dominant === "short_medium") dominant = "medium";
  // } else if (cadenceLeanShort.includes(cadenceId)) {
  //   if (dominant === "long") dominant = "medium_long";
  //   else if (dominant === "medium_long") dominant = "medium";
  // }
  //
  // return WORD_BANDS[dominant as keyof typeof WORD_BANDS] ?? WORD_BANDS.medium;
}

// ─── Phase 13: Compounds ───────────────────────────────────────────────────

function pickCompounds(
  rng: SeededRng,
  subNiche: SubNicheId,
): { primary: string[]; secondary: string[] } {
  const canon = canonForSubNiche(subNiche);

  // Pool for primary
  let primaryPool: string[];
  if (canon.mode === "broad") {
    if (canon.adjacent.includes("news_driven_lean_glp1")) {
      primaryPool = [...GLP1_COMPOUNDS];
    } else if (canon.adjacent.includes("any") || canon.adjacent.includes("any_common")) {
      primaryPool = [...ALL_COMPOUNDS];
    } else {
      primaryPool = [...ALL_COMPOUNDS];
    }
  } else {
    primaryPool = [...canon.primary];
  }

  if (primaryPool.length < 2) {
    // Fall through to global canon
    primaryPool = [...ALL_COMPOUNDS];
  }

  const primary = pickN(rng, primaryPool, 2);

  // Secondary pool excludes primary picks
  let secondaryPool: string[];
  if (canon.mode === "broad") {
    secondaryPool = ALL_COMPOUNDS.filter((c) => !primary.includes(c));
  } else {
    const named = new Set<string>();
    canon.primary.forEach((c) => named.add(c));
    for (const adj of canon.adjacent) {
      if (
        adj === "any" ||
        adj === "any_common" ||
        adj === "news_driven_lean_glp1" ||
        adj === "6_compound_stacks"
      ) {
        continue;
      }
      named.add(adj);
    }
    secondaryPool = Array.from(named).filter((c) => !primary.includes(c));
  }

  if (secondaryPool.length < 4) {
    // Pad with global canon
    const padding = ALL_COMPOUNDS.filter(
      (c) => !primary.includes(c) && !secondaryPool.includes(c),
    );
    while (secondaryPool.length < 4 && padding.length > 0) {
      const idx = Math.floor(rng.next() * padding.length);
      secondaryPool.push(padding[idx]);
      padding.splice(idx, 1);
    }
  }

  const secondary = pickN(rng, secondaryPool, Math.min(4, secondaryPool.length));
  while (secondary.length < 4) {
    secondary.push(ALL_COMPOUNDS[0]);
  }

  return { primary, secondary };
}

// ─── Compile + Hamming reroll ──────────────────────────────────────────────

interface DrawResult {
  profile: StyleProfile;
}

function compose(
  blogId: string,
  nicheKey: string,
  pieces: {
    subNicheId: SubNicheId;
    voiceId: VoiceId;
    skeletonId: SkeletonId;
    cadenceId: CadenceId;
    quirks: QuirkId[];
    schemaId: SchemaId;
    tagSetId: TagSetId;
    citationStyleId: CitationStyleId;
    structuralPool: TemplateId[];
    compliancePhraseIds: CompliancePhraseId[];
    compliancePlacement: CompliancePlacement;
    wordBand: [number, number];
    scrubberStrictness: ScrubberStrictness;
    primaryCompounds: string[];
    secondaryCompounds: string[];
    assignmentSeed: string;
  },
): StyleProfile {
  return {
    blogId,
    nicheKey,
    subNicheId: pieces.subNicheId,
    voiceId: pieces.voiceId,
    skeletonId: pieces.skeletonId,
    cadenceId: pieces.cadenceId,
    quirks: pieces.quirks,
    schemaId: pieces.schemaId,
    tagSetId: pieces.tagSetId,
    citationStyleId: pieces.citationStyleId,
    structuralPool: pieces.structuralPool,
    compliancePhraseIds: pieces.compliancePhraseIds,
    compliancePlacement: pieces.compliancePlacement,
    wordBandMin: pieces.wordBand[0],
    wordBandMax: pieces.wordBand[1],
    scrubberStrictness: pieces.scrubberStrictness,
    primaryCompounds: pieces.primaryCompounds,
    secondaryCompounds: pieces.secondaryCompounds,
    assignmentSeed: pieces.assignmentSeed,
  };
}

/**
 * Main entry point. Runs all 14 phases against `network`, returns a complete
 * StyleProfile. Deterministic for a given `seed` and `network` state.
 *
 * `seed` should be the blog id (UUID) — that gives every blog a stable
 * "lottery" while still varying across blogs.
 *
 * `nicheKey` controls which library subsets are eligible. Defaults to
 * "peptides" (the original architecture). For other niches (gambling,
 * web_dev, payment_processing, etc.), pass the normalised client niche
 * key; the algorithm picks from the niche's voice pool + sub-niche +
 * compliance phrase IDs as defined in niches.ts.
 */
export function assignProfile(
  blogId: string,
  network: NetworkState,
  options: { seed?: string; nicheKey?: string } = {},
): StyleProfile {
  const seed = options.seed ?? blogId;
  const nicheKey = options.nicheKey ?? PEPTIDES_NICHE_KEY;
  const niche = nicheConfig(nicheKey);
  if (!niche) {
    throw new Error(
      `Unknown niche "${nicheKey}" — register it in src/lib/content/libraries/niches.ts before assigning profiles.`,
    );
  }
  const rng = new SeededRng(seed);

  // Phase 1
  const subNicheId = pickSubNiche(rng, network, niche);
  // Phase 2
  const voiceId = pickVoice(rng, network, subNicheId, niche);
  const voice = VOICES[voiceId];
  // Phase 3
  const skeletonId = pickSkeleton(rng, network, voiceId);
  // Phase 4
  const cadenceId = pickCadence(rng, network, voice, subNicheId);
  // Phase 5
  const tagSetId = pickTagSet(rng, voiceId, subNicheId, cadenceId);
  // Phase 6
  const schemaId = pickSchema(rng, voiceId);
  // Phase 7
  const citationStyleId = pickCitationStyle(rng, network, voice);
  // Phase 8
  const quirks = pickQuirks(rng, network, voice);
  // Phase 9
  const structuralPool = buildStructuralPool(rng, voiceId, subNicheId, tagSetId, cadenceId);
  // Phase 12 (strictness) — needed before Phase 10 phrase pick (phrase 16 rule)
  const scrubberStrictness = defaultStrictness(voiceId, subNicheId);
  // Phase 10
  const compliancePhraseIds = pickCompliancePhrases(rng, network, scrubberStrictness, niche);
  const compliancePlacement = pickPlacement(rng, network, scrubberStrictness);
  // Phase 11
  const wordBand = pickWordBand(rng, cadenceId, structuralPool);
  // Phase 13
  const { primary, secondary } = pickCompounds(rng, subNicheId);

  let profile = compose(blogId, nicheKey, {
    subNicheId,
    voiceId,
    skeletonId,
    cadenceId,
    quirks,
    schemaId,
    tagSetId,
    citationStyleId,
    structuralPool,
    compliancePhraseIds,
    compliancePlacement,
    wordBand,
    scrubberStrictness,
    primaryCompounds: primary,
    secondaryCompounds: secondary,
    assignmentSeed: seed,
  });

  // Phase 14: Hamming reroll
  let distance = minHammingToNetwork(profile, network.allProfiles);
  if (network.allProfiles.length > 0 && distance < MIN_HAMMING_REQUIRED) {
    for (let attempt = 0; attempt < 5; attempt++) {
      profile = rerollRedundant(rng, profile, network);
      distance = minHammingToNetwork(profile, network.allProfiles);
      if (distance >= MIN_HAMMING_REQUIRED) break;
    }
  }
  profile.minHammingAtAssign = isFinite(distance) ? distance : MIN_HAMMING_REQUIRED;
  return profile;
}

/**
 * Reroll the fields most-shared with the closest neighbour. Order matters —
 * cheapest fields first (quirks > structuralPool > compliance > tagSet >
 * cadence). Voice and sub_niche are never rerolled because they cascade
 * downstream constraints.
 */
function rerollRedundant(
  rng: SeededRng,
  profile: StyleProfile,
  network: NetworkState,
): StyleProfile {
  const neighbour = closestNeighbour(profile, network.allProfiles);
  if (!neighbour) return profile;
  const other = neighbour.other;
  const next = { ...profile };

  // 1. Quirks
  if (sharesMost(profile.quirks, other.quirks)) {
    const voice = VOICES[profile.voiceId];
    next.quirks = pickQuirks(rng, network, voice);
    if (hammingDistance(next, other) >= MIN_HAMMING_REQUIRED) return next;
  }

  // 2. Structural pool
  if (sharesMost(profile.structuralPool, other.structuralPool)) {
    next.structuralPool = buildStructuralPool(
      rng,
      profile.voiceId,
      profile.subNicheId,
      profile.tagSetId,
      profile.cadenceId,
    );
    if (hammingDistance(next, other) >= MIN_HAMMING_REQUIRED) return next;
  }

  // 3. Compliance phrases
  if (sharesMost(profile.compliancePhraseIds, other.compliancePhraseIds)) {
    const niche = nicheConfig(profile.nicheKey);
    if (niche) {
      next.compliancePhraseIds = pickCompliancePhrases(
        rng,
        network,
        profile.scrubberStrictness,
        niche,
      );
      if (hammingDistance(next, other) >= MIN_HAMMING_REQUIRED) return next;
    }
  }

  // 4. Tag set
  if (profile.tagSetId === other.tagSetId) {
    next.tagSetId = pickTagSet(
      rng,
      profile.voiceId,
      profile.subNicheId,
      profile.cadenceId,
    );
    if (hammingDistance(next, other) >= MIN_HAMMING_REQUIRED) return next;
  }

  // 5. Cadence (last resort because it cascades to word band)
  if (profile.cadenceId === other.cadenceId) {
    const voice = VOICES[profile.voiceId];
    next.cadenceId = pickCadence(rng, network, voice, profile.subNicheId);
  }

  return next;
}

function sharesMost(a: readonly number[], b: readonly number[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  const setA = new Set(a);
  let inter = 0;
  for (const x of b) if (setA.has(x)) inter++;
  return inter >= Math.min(a.length, b.length) - 1;
}
