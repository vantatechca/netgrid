import type {
  ArchetypeId,
  CadenceId,
  ScrubberStrictness,
  SchemaId,
  SkeletonId,
  SubNicheId,
  VoiceId,
} from "../types";
import { SKELETONS } from "./skeletons";
import { archetypeForVoice, ARCHETYPES } from "./archetypes";

/**
 * Skeleton-to-voice (archetype) compatibility — the table from the closeout
 * of Batch 5. Maps each skeleton to its strongPairs and hard avoids.
 *
 * "avoid" is a hard exclusion in this implementation — the picker drops the
 * skeleton from the eligible set when the avoid matches.
 */

export function isSkeletonCompatibleWithVoice(
  skeletonId: SkeletonId,
  voiceId: VoiceId,
): boolean {
  const skel = SKELETONS[skeletonId];
  if (!skel) return false;

  // Hard exclusion via voiceIds
  if (skel.affinity.voiceIds && skel.affinity.voiceIds.length > 0) {
    return skel.affinity.voiceIds.includes(voiceId);
  }

  const archetype = archetypeForVoice(voiceId);

  if (skel.affinity.avoidArchetypes?.includes(archetype)) return false;

  // If positive archetype list exists, voice must match
  if (skel.affinity.archetypes && skel.affinity.archetypes.length > 0) {
    return skel.affinity.archetypes.includes(archetype);
  }

  // No positive list, no avoid hit → compatible
  return true;
}

export function isSkeletonCompatibleWithCadence(
  skeletonId: SkeletonId,
  cadenceId: CadenceId,
): boolean {
  const skel = SKELETONS[skeletonId];
  if (skel.affinity.avoidCadenceIds?.includes(cadenceId)) return false;
  if (skel.affinity.cadenceIds && skel.affinity.cadenceIds.length > 0) {
    return skel.affinity.cadenceIds.includes(cadenceId);
  }
  return true;
}

export function isSkeletonCompatibleWithSubNiche(
  skeletonId: SkeletonId,
  subNiche: SubNicheId,
): boolean {
  const skel = SKELETONS[skeletonId];
  if (skel.affinity.subNiches && skel.affinity.subNiches.length > 0) {
    return skel.affinity.subNiches.includes(subNiche);
  }
  return true;
}

export function isSkeletonCompatibleWithStrictness(
  skeletonId: SkeletonId,
  strictness: ScrubberStrictness,
): boolean {
  const skel = SKELETONS[skeletonId];
  if (skel.affinity.strictness && skel.affinity.strictness.length > 0) {
    return skel.affinity.strictness.includes(strictness);
  }
  return true;
}

// ── Schema overrides by voice ──────────────────────────────────────────────

/**
 * Schema override rules from Phase 6:
 *   V30–V35 (beginner range, A5) → bias toward Schema C (FAQ-rich, id=3)
 *   V72–V77 (industry analyst, A12) → bias toward Schema B (magazine, id=2)
 */
export function schemaBiasForVoice(voiceId: VoiceId): SchemaId | null {
  if (voiceId >= 30 && voiceId <= 35) return 3;
  if (voiceId >= 72 && voiceId <= 77) return 2;
  return null;
}

// ── Strictness default table (Batch 6) ─────────────────────────────────────

export function defaultStrictnessForArchetype(
  archetype: ArchetypeId,
): ScrubberStrictness {
  return ARCHETYPES[archetype].defaultStrictness;
}

export function defaultStrictness(
  voiceId: VoiceId,
  subNiche: SubNicheId,
): ScrubberStrictness {
  // Sub-niche overrides take priority
  if (subNiche === 4 || subNiche === 10) return "strict";

  const archetype = archetypeForVoice(voiceId);
  return defaultStrictnessForArchetype(archetype);
}

