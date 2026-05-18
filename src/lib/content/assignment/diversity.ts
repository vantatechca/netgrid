import type { StyleProfile } from "../types";

/**
 * Hamming distance between two style profiles. Higher = more different.
 *
 * Single-valued fields contribute 1 if they differ. Set-valued fields
 * (quirks, structuralPool, compliancePhraseIds, primaryCompounds,
 * secondaryCompounds) contribute Jaccard distance:
 *   1.0 if disjoint, 0.0 if identical, 0.5 if half overlap.
 *
 * Compounds are excluded from the metric because the canon constraints make
 * primary/secondary overlap inevitable inside a sub-niche; the metric is
 * about *stylistic* uniqueness.
 *
 * Maximum theoretical distance: 8 single + 3 set = 11. The minimum-required
 * distance is 4 (Batch 7 target). The mean/median targets are 4.5/4.
 */
export function hammingDistance(a: StyleProfile, b: StyleProfile): number {
  let d = 0;

  // Single-valued
  if (a.subNicheId !== b.subNicheId) d += 1;
  if (a.voiceId !== b.voiceId) d += 1;
  if (a.skeletonId !== b.skeletonId) d += 1;
  if (a.cadenceId !== b.cadenceId) d += 1;
  if (a.schemaId !== b.schemaId) d += 1;
  if (a.tagSetId !== b.tagSetId) d += 1;
  if (a.citationStyleId !== b.citationStyleId) d += 1;
  if (a.compliancePlacement !== b.compliancePlacement) d += 1;

  // Set-valued via Jaccard distance
  d += jaccardDistance(a.quirks, b.quirks);
  d += jaccardDistance(a.structuralPool, b.structuralPool);
  d += jaccardDistance(a.compliancePhraseIds, b.compliancePhraseIds);

  return d;
}

function jaccardDistance(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  if (union === 0) return 0;
  return 1 - inter / union;
}

/**
 * Find the minimum Hamming distance from `profile` to any in `network`. If
 * the network is empty, returns Infinity (no constraint to satisfy).
 */
export function minHammingToNetwork(
  profile: StyleProfile,
  network: readonly StyleProfile[],
): number {
  let min = Infinity;
  for (const other of network) {
    if (other.blogId === profile.blogId) continue;
    const d = hammingDistance(profile, other);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Identify the closest neighbour in the network so we can target reroll on
 * the fields they share.
 */
export function closestNeighbour(
  profile: StyleProfile,
  network: readonly StyleProfile[],
): { other: StyleProfile; distance: number } | null {
  let best: { other: StyleProfile; distance: number } | null = null;
  for (const other of network) {
    if (other.blogId === profile.blogId) continue;
    const d = hammingDistance(profile, other);
    if (!best || d < best.distance) {
      best = { other, distance: d };
    }
  }
  return best;
}

export const MIN_HAMMING_REQUIRED = 4;
