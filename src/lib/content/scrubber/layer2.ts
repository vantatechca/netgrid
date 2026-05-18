import type { StyleProfile } from "../types";
import type { Violation } from "./types";
import { paragraphsFromHtml } from "./layer1";

/**
 * Layer 2C — the killer AI tell.
 *
 * Paragraphs of consistently 3 or 4 sentences across an entire article is
 * the single most reliable signature of AI-generated content after em-dashes.
 * If 80%+ of paragraphs are exactly 3 sentences OR exactly 4 sentences OR
 * 70%+ are some mix of 3-or-4 sentences, the post fails uniformity check
 * and the orchestrator regenerates.
 *
 * The MVP scrubber implements only this Layer 2 check — 2A, 2B, 2D, 2E, 2F,
 * 2G can be added later. 2C is the one that meaningfully changes output
 * quality.
 */
export function runLayer2Uniformity(
  content: string,
  _profile: StyleProfile,
): Violation[] {
  const paragraphs = paragraphsFromHtml(content);

  // Filter to "real" paragraphs — drop very short / structural bits
  const real = paragraphs.filter((p) => p.length >= 40);
  if (real.length < 5) {
    // Article too short for a meaningful uniformity check
    return [];
  }

  let count3 = 0;
  let count4 = 0;
  for (const p of real) {
    const sentences = (p.match(/[.!?](?:\s|$)/g) ?? []).length;
    if (sentences === 3) count3++;
    else if (sentences === 4) count4++;
  }

  const total = real.length;
  const pct3 = count3 / total;
  const pct4 = count4 / total;
  const pct34 = (count3 + count4) / total;

  const violations: Violation[] = [];

  if (pct3 >= 0.8) {
    violations.push({
      kind: "paragraph_uniformity_3",
      severity: "high",
      layer: "2C",
      detail: `${(pct3 * 100).toFixed(0)}% of paragraphs are exactly 3 sentences — AI uniformity signal`,
      loc: `pct3_${pct3.toFixed(2)}`,
    });
  } else if (pct4 >= 0.8) {
    violations.push({
      kind: "paragraph_uniformity_4",
      severity: "high",
      layer: "2C",
      detail: `${(pct4 * 100).toFixed(0)}% of paragraphs are exactly 4 sentences — AI uniformity signal`,
      loc: `pct4_${pct4.toFixed(2)}`,
    });
  } else if (pct34 >= 0.7) {
    violations.push({
      kind: "paragraph_uniformity_mixed",
      severity: "high",
      layer: "2C",
      detail: `${(pct34 * 100).toFixed(0)}% of paragraphs are 3 or 4 sentences — AI uniformity signal`,
      loc: `pct34_${pct34.toFixed(2)}`,
    });
  }

  return violations;
}
