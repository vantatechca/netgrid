export type Severity = "low" | "medium" | "high" | "critical";

export type ViolationKind =
  | "vocab_violation"
  | "phrase_violation"
  | "schema_violation"
  | "schema_field_missing"
  | "structural_mismatch_headerless"
  | "word_count_under"
  | "word_count_over"
  | "compliance_missing"
  | "compliance_drift"
  | "paragraph_uniformity_3"
  | "paragraph_uniformity_4"
  | "paragraph_uniformity_mixed";

export type FixApplied =
  | "em_dash_replaced"
  | "en_dash_replaced"
  | "smart_quotes_replaced"
  | "ellipsis_replaced"
  | "tag_stripped"
  | "tag_unwrapped"
  | "compliance_inserted_top"
  | "compliance_inserted_bottom"
  | "compliance_inserted_top_and_bottom";

export interface Violation {
  kind: ViolationKind;
  severity: Severity;
  layer: "1A" | "1B" | "1C" | "1D" | "1E" | "1F" | "1G" | "2C";
  detail: string;
  match?: string;
  matches?: string[];
  /** Approximate location for debugging ("para_3", "first_250", "tag_h4_count_2"). */
  loc?: string;
}

export interface ScrubberReport {
  timestamp: string;
  blogId?: string;
  skeletonId?: number;
  voiceId?: number;
  violations: {
    critical: Violation[];
    high: Violation[];
    medium: Violation[];
    low: Violation[];
  };
  fixesApplied: FixApplied[];
  action:
    | "ACCEPTED"
    | "ACCEPT_WITH_FLAG"
    | "REGENERATE_NEEDED"
    | "SEMANTIC_REWRITE_NEEDED";
  attempts: 0 | 1 | 2;
  finalStatus: "ACCEPTED" | "FLAGGED_FOR_REVIEW";
}

/**
 * The scrubber's decision for one post, as a single discriminant.
 *
 *   accepted            — within the profile's strictness thresholds.
 *   accepted_with_flag  — over threshold but no terminal violation. The prose
 *                         needs a semantic rewrite; regenerating with the same
 *                         prompt is unlikely to help, so hold for a human.
 *   regenerate_requested— terminal: a critical violation, or a structural
 *                         mismatch Layer 1 could not repair. Regenerate.
 */
export type ScrubberVerdict =
  | "accepted"
  | "accepted_with_flag"
  | "regenerate_requested";

/**
 * Short-form strings that ship WITH a post but are not part of the body:
 * the article title (rendered as the page H1), the SEO meta title and
 * description, and the excerpt. Before T07 these bypassed the scrubber
 * entirely.
 */
export interface ScrubbedFields {
  title?: string;
  metaTitle?: string;
  metaDescription?: string;
  excerpt?: string;
}

export interface ScrubberResult {
  /** The (possibly auto-fixed) content. */
  content: string;
  /**
   * The (possibly auto-fixed) short fields, keyed the same way they were
   * passed in. A key is present only when the caller supplied it.
   */
  fields: ScrubbedFields;
  report: ScrubberReport;
  /** Single discriminant for the caller to branch on. */
  verdict: ScrubberVerdict;
  /**
   * True if the post should be flagged for review. Set for BOTH
   * accepted_with_flag and regenerate_requested — a terminal violation is
   * the worst outcome, so it must never carry a weaker flag than a
   * threshold breach.
   */
  flaggedForReview: boolean;
  /** True if scrubber wants the caller to regenerate. */
  regenerateRequested: boolean;
}
