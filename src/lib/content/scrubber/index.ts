import type { ScrubberStrictness, StyleProfile } from "../types";
import { runLayer1 } from "./layer1";
import { runLayer2Uniformity } from "./layer2";
import type {
  ScrubberReport,
  ScrubberResult,
  Violation,
} from "./types";

/**
 * Strictness threshold table (Batch 6 Decision Engine, Step 2).
 *
 *   loose:    critical 0, high 2, medium 5, low 5
 *   standard: critical 0, high 1, medium 3, low 3
 *   strict:   critical 0, high 0, medium 1, low 2
 */
const THRESHOLDS: Record<
  ScrubberStrictness,
  { critical: number; high: number; medium: number; low: number }
> = {
  loose: { critical: 0, high: 2, medium: 5, low: 5 },
  standard: { critical: 0, high: 1, medium: 3, low: 3 },
  strict: { critical: 0, high: 0, medium: 1, low: 2 },
};

function bucket(violations: Violation[]): ScrubberReport["violations"] {
  const out: ScrubberReport["violations"] = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const v of violations) {
    out[v.severity].push(v);
  }
  return out;
}

function passesStrictness(
  bucketed: ScrubberReport["violations"],
  s: ScrubberStrictness,
): boolean {
  const t = THRESHOLDS[s];
  return (
    bucketed.critical.length <= t.critical &&
    bucketed.high.length <= t.high &&
    bucketed.medium.length <= t.medium &&
    bucketed.low.length <= t.low
  );
}

export interface RunScrubberInput {
  content: string;
  profile: StyleProfile;
  /** Skeleton id used to generate (for the report). */
  skeletonId?: number;
  /** Voice id used (for the report). */
  voiceId?: number;
}

/**
 * Run the scrubber on a generated post. Returns the (possibly auto-fixed)
 * content plus a report. The orchestrator does NOT itself trigger retries —
 * it returns `regenerateRequested` and lets the caller decide.
 *
 * MVP wiring: caller (content-generator) checks `regenerateRequested` and
 * either retries once or accepts with flag. This avoids deep retry recursion
 * inside the scrubber itself.
 */
export function runScrubber(input: RunScrubberInput): ScrubberResult {
  const { profile } = input;
  const violations: Violation[] = [];
  const fixesApplied: ScrubberReport["fixesApplied"] = [];

  // Layer 1
  const l1 = runLayer1(input.content, profile);
  violations.push(...l1.violations);
  fixesApplied.push(...l1.fixesApplied);
  let content = l1.content;

  // If Layer 1 hit a terminal violation (tag set 6 + heading), skip Layer 2.
  if (!l1.terminal) {
    const l2 = runLayer2Uniformity(content, profile);
    violations.push(...l2);
  }

  const bucketed = bucket(violations);

  // Determine action
  const passes = passesStrictness(bucketed, profile.scrubberStrictness);
  const hasTerminal = bucketed.critical.length > 0 || l1.terminal;

  let action: ScrubberReport["action"];
  let regenerateRequested = false;
  let flaggedForReview = false;
  let finalStatus: ScrubberReport["finalStatus"];

  if (hasTerminal) {
    action = "REGENERATE_NEEDED";
    regenerateRequested = true;
    flaggedForReview = false;
    finalStatus = "FLAGGED_FOR_REVIEW";
  } else if (passes) {
    action = "ACCEPTED";
    finalStatus = "ACCEPTED";
  } else {
    // Doesn't pass but no critical — semantic rewrite would help. For MVP we
    // flag for review and let admin re-roll manually rather than auto-retry.
    action = "ACCEPT_WITH_FLAG";
    flaggedForReview = true;
    finalStatus = "FLAGGED_FOR_REVIEW";
  }

  const report: ScrubberReport = {
    timestamp: new Date().toISOString(),
    blogId: profile.blogId,
    skeletonId: input.skeletonId ?? profile.skeletonId,
    voiceId: input.voiceId ?? profile.voiceId,
    violations: bucketed,
    fixesApplied,
    action,
    attempts: 0,
    finalStatus,
  };

  return { content, report, flaggedForReview, regenerateRequested };
}

/**
 * Run the scrubber for a non-peptide blog (no profile). We still apply Layer
 * 1's punctuation and AI-tell checks but without compliance / tag-set
 * enforcement. Returns the auto-fixed content + a lightweight report.
 *
 * This gives every niche the "punctuation auto-fix + AI-tell warning" win
 * without requiring a full profile assignment.
 */
export function runScrubberLite(content: string): {
  content: string;
  violationCount: number;
  fixesApplied: ScrubberReport["fixesApplied"];
} {
  // Synthetic profile with permissive defaults for layer 1 to operate on.
  const syntheticProfile: StyleProfile = {
    blogId: "lite",
    nicheKey: "generic",
    subNicheId: 1,
    voiceId: 1,
    skeletonId: 1,
    cadenceId: 1,
    quirks: [],
    schemaId: 1,
    tagSetId: 2, // standard tag set
    citationStyleId: 4,
    structuralPool: [1],
    compliancePhraseIds: [],
    compliancePlacement: "BOTTOM",
    wordBandMin: 0,
    wordBandMax: 10_000_000,
    scrubberStrictness: "loose",
    primaryCompounds: [],
    secondaryCompounds: [],
  };
  const r = runLayer1(content, syntheticProfile);
  // Drop compliance-related violations (no profile)
  const v = r.violations.filter(
    (x) => x.kind !== "compliance_missing" && x.kind !== "compliance_drift",
  );
  return {
    content: r.content,
    violationCount: v.length,
    fixesApplied: r.fixesApplied,
  };
}

export type { ScrubberReport, ScrubberResult } from "./types";
