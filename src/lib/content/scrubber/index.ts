import type { ScrubberStrictness, StyleProfile } from "../types";
import { runLayer1, runLayer1ShortText, type ShortFieldKey } from "./layer1";
import { runLayer2Uniformity } from "./layer2";
import type {
  ScrubbedFields,
  ScrubberReport,
  ScrubberResult,
  ScrubberVerdict,
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
  /**
   * Short-form fields that ship WITH the post but are not part of the body.
   * Pass the FINAL, already-normalized strings (post normalizeMetaTitle /
   * normalizeExcerpt) — the scrubber returns fixed replacements in
   * `result.fields`, and its verdict accounts for them.
   */
  fields?: ScrubbedFields;
  /** 0 on the first pass; 1 or 2 on a caller-driven regeneration. */
  attempt?: 0 | 1 | 2;
}

const SHORT_FIELDS: readonly ShortFieldKey[] = [
  "title",
  "metaTitle",
  "metaDescription",
  "excerpt",
];

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
  const content = l1.content;

  // If Layer 1 hit a terminal violation (tag set 6 + heading), skip Layer 2.
  if (!l1.terminal) {
    const l2 = runLayer2Uniformity(content, profile);
    violations.push(...l2);
  }

  // Short fields — title / meta / excerpt. Before T07 these bypassed every
  // check, so an em dash or a blocklisted word in the title shipped straight
  // to the SERP. Their violations count toward the same thresholds as the
  // body's, which is what makes the title a first-class part of the verdict.
  const fields: ScrubbedFields = {};
  for (const key of SHORT_FIELDS) {
    const raw = input.fields?.[key];
    if (typeof raw !== "string" || raw.length === 0) continue;
    const r = runLayer1ShortText(raw, key, profile);
    fields[key] = r.text;
    violations.push(...r.violations);
    for (const f of r.fixesApplied) {
      if (!fixesApplied.includes(f)) fixesApplied.push(f);
    }
  }

  const bucketed = bucket(violations);

  // Determine action
  const passes = passesStrictness(bucketed, profile.scrubberStrictness);
  const hasTerminal = bucketed.critical.length > 0 || l1.terminal;

  let action: ScrubberReport["action"];
  let verdict: ScrubberVerdict;
  let regenerateRequested = false;
  let flaggedForReview = false;
  let finalStatus: ScrubberReport["finalStatus"];

  if (hasTerminal) {
    action = "REGENERATE_NEEDED";
    verdict = "regenerate_requested";
    regenerateRequested = true;
    // T07: was `false`. A terminal violation is the WORST verdict the
    // scrubber can reach, and the same branch already set finalStatus to
    // FLAGGED_FOR_REVIEW — the boolean and the report disagreed. The effect
    // was that the only posts guaranteed to reach publish carrying no review
    // flag were the ones the scrubber had rejected outright.
    flaggedForReview = true;
    finalStatus = "FLAGGED_FOR_REVIEW";
  } else if (passes) {
    action = "ACCEPTED";
    verdict = "accepted";
    finalStatus = "ACCEPTED";
  } else {
    // Doesn't pass but no critical — semantic rewrite would help. Re-rolling
    // the same prompt rarely clears a threshold breach, so this verdict is
    // NOT a regenerate request: it holds the post for a human instead.
    action = "ACCEPT_WITH_FLAG";
    verdict = "accepted_with_flag";
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
    attempts: input.attempt ?? 0,
    finalStatus,
  };

  return {
    content,
    fields,
    report,
    verdict,
    flaggedForReview,
    regenerateRequested,
  };
}

/**
 * Run the scrubber for a non-peptide blog (no profile). We still apply Layer
 * 1's punctuation and AI-tell checks but without compliance / tag-set
 * enforcement. Returns the auto-fixed content + a lightweight report.
 *
 * This gives every niche the "punctuation auto-fix + AI-tell warning" win
 * without requiring a full profile assignment.
 */
export function runScrubberLite(
  content: string,
  fields?: ScrubbedFields,
): {
  content: string;
  fields: ScrubbedFields;
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
  // Same punctuation win for the short fields. No thresholds on this path —
  // the violations are counted for logging only, never gating.
  const scrubbedFields: ScrubbedFields = {};
  let shortViolations = 0;
  const fixes = [...r.fixesApplied];
  for (const key of SHORT_FIELDS) {
    const raw = fields?.[key];
    if (typeof raw !== "string" || raw.length === 0) continue;
    const sres = runLayer1ShortText(raw, key, syntheticProfile);
    scrubbedFields[key] = sres.text;
    shortViolations += sres.violations.length;
    for (const f of sres.fixesApplied) {
      if (!fixes.includes(f)) fixes.push(f);
    }
  }

  return {
    content: r.content,
    fields: scrubbedFields,
    violationCount: v.length + shortViolations,
    fixesApplied: fixes,
  };
}

export type {
  ScrubbedFields,
  ScrubberReport,
  ScrubberResult,
  ScrubberVerdict,
  Violation,
} from "./types";

export {
  DEFAULT_SCRUBBER_ENFORCEMENT,
  logScrubberVerdict,
  scrubberEnforcementMode,
  scrubberSummary,
  shouldHoldForReview,
  SCRUBBER_HOLD_PREFIX,
  SCRUBBER_REJECT_REASON,
  type ScrubberEnforcement,
} from "./enforcement";
