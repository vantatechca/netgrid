import type { ScrubberReport, ScrubberVerdict } from "./types";

/**
 * How hard the scrubber verdict is enforced at publish time.
 *
 *   off     — record the report, publish regardless, log nothing.
 *             Exactly the pre-T07 behaviour; the instant rollback switch.
 *   shadow  — record the report, publish regardless, but log one
 *             [scrubber-gate] line per post saying what WOULD have happened.
 *             The default, and how this ships.
 *   enforce — a flagged post is parked in generated_posts.status
 *             'needs_review' and never reaches the platform until an admin
 *             releases it.
 *
 * Set on the Render WEB service (not the cron services — those only curl the
 * web service's /api/cron/auto-publish route, so the handler runs with the
 * web service's env):
 *
 *   SCRUBBER_ENFORCEMENT = off | shadow | enforce
 *
 * An unset or unrecognised value resolves to "shadow".
 */
export type ScrubberEnforcement = "off" | "shadow" | "enforce";

export const DEFAULT_SCRUBBER_ENFORCEMENT: ScrubberEnforcement = "shadow";

/** Prefix written into generated_posts.failure_reason when a post is held. */
export const SCRUBBER_HOLD_PREFIX = "Held by the content scrubber:";

/** failure_reason written when an admin rejects a held post. */
export const SCRUBBER_REJECT_REASON = "Rejected in scrubber review";

export function scrubberEnforcementMode(): ScrubberEnforcement {
  const raw = (process.env.SCRUBBER_ENFORCEMENT ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "shadow" || raw === "enforce") return raw;
  return DEFAULT_SCRUBBER_ENFORCEMENT;
}

/**
 * True when a flagged post must be held instead of published. The ONLY
 * place the enforcement decision is made — both publish paths call this so
 * they cannot drift apart.
 */
export function shouldHoldForReview(flaggedForReview: boolean): boolean {
  return flaggedForReview && scrubberEnforcementMode() === "enforce";
}

/**
 * Human-readable one-liner for a report — used for failure_reason, toasts
 * and the review queue. Leads with the counts, then the first blocking
 * violation's detail so the reader knows what to look at.
 */
export function scrubberSummary(report?: ScrubberReport | null): string {
  if (!report) return "no scrubber report";
  const v = report.violations;
  const counts =
    `${v.critical.length} critical / ${v.high.length} high / ` +
    `${v.medium.length} medium / ${v.low.length} low`;
  const first = [...v.critical, ...v.high][0];
  return first ? `${counts} — ${first.detail}` : counts;
}

/**
 * One structured log line per generated post. This is the shadow-mode
 * instrument: with mode=shadow it prints held=true for posts that WOULD be
 * held, while the post still publishes, so a week of logs answers "what
 * fraction of the network does enforcement stop?" without risking a single
 * missed publish.
 *
 * Grep-friendly on purpose.
 */
export function logScrubberVerdict(ctx: {
  domain: string;
  generatedPostId: string;
  strictness?: string | null;
  verdict?: ScrubberVerdict;
  flaggedForReview: boolean;
  report?: ScrubberReport | null;
}): void {
  const mode = scrubberEnforcementMode();
  if (mode === "off") return;

  const v = ctx.report?.violations;
  const held = mode === "enforce" && ctx.flaggedForReview;

  console.info(
    `[scrubber-gate] mode=${mode} blog=${ctx.domain} post=${ctx.generatedPostId} ` +
      `strictness=${ctx.strictness ?? "none"} verdict=${ctx.verdict ?? "none"} ` +
      `flagged=${ctx.flaggedForReview} held=${held} ` +
      `attempts=${ctx.report?.attempts ?? 0} ` +
      `critical=${v?.critical.length ?? 0} high=${v?.high.length ?? 0} ` +
      `medium=${v?.medium.length ?? 0} low=${v?.low.length ?? 0} ` +
      `fixes=${ctx.report?.fixesApplied.length ?? 0}`,
  );
}
