import type { StyleProfile } from "../types";
import {
  PHRASE_BLOCKLIST,
  VOCAB_BLOCKLIST,
} from "../libraries/ai-tells";
import { COMPLIANCE_PHRASES } from "../libraries/compliance-phrases";
import { HEADERLESS_TAG_SET_ID, TAG_SETS } from "../libraries/tag-sets";
import type { FixApplied, Violation } from "./types";

export interface Layer1Output {
  content: string;
  violations: Violation[];
  fixesApplied: FixApplied[];
  /** True when a violation is unrecoverable and the post should be regenerated. */
  terminal: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(plainText: string): number {
  return plainText ? plainText.split(/\s+/).filter((w) => w.length > 0).length : 0;
}

function paragraphsFromHtml(html: string): string[] {
  // Split on </p>, </li>, </h2/h3/h4>, and double-newlines.
  // We treat each top-level block as a paragraph for uniformity checking.
  const blocks = html
    .split(/<\/(?:p|li|h[1-6]|blockquote)>/i)
    .map((s) => stripHtmlToPlainText(s))
    .filter((s) => s.length > 0);
  return blocks;
}

// ── 1A: Vocabulary blocklist ───────────────────────────────────────────────

function checkVocab(plainText: string): Violation[] {
  const violations: Violation[] = [];
  for (const re of VOCAB_BLOCKLIST) {
    const matches = plainText.match(re);
    if (matches && matches.length > 0) {
      violations.push({
        kind: "vocab_violation",
        severity: "medium",
        layer: "1A",
        detail: `Vocabulary blocklist hit: "${matches[0]}"`,
        match: matches[0],
        matches: matches.slice(0, 5),
      });
    }
  }
  return violations;
}

// ── 1B: Phrase blocklist ───────────────────────────────────────────────────

function checkPhrases(plainText: string): Violation[] {
  const violations: Violation[] = [];
  for (const re of PHRASE_BLOCKLIST) {
    const matches = plainText.match(re);
    if (matches && matches.length > 0) {
      violations.push({
        kind: "phrase_violation",
        severity: "high",
        layer: "1B",
        detail: `Phrase blocklist hit: "${matches[0]}"`,
        match: matches[0],
        matches: matches.slice(0, 5),
      });
    }
  }
  return violations;
}

// ── 1C: Punctuation auto-fix ───────────────────────────────────────────────

function applyPunctuationFixes(
  content: string,
  hasEmDashFreeQuirk: boolean,
): { content: string; fixes: FixApplied[]; violations: Violation[] } {
  const fixes: FixApplied[] = [];
  const violations: Violation[] = [];

  let fixed = content;

  if (/—/.test(fixed)) {
    fixed = fixed.replace(/—/g, ", ");
    fixes.push("em_dash_replaced");
  }
  if (/\s–\s/.test(fixed)) {
    fixed = fixed.replace(/\s–\s/g, ", ");
    fixes.push("en_dash_replaced");
  }
  if (/[‘’]/.test(fixed)) {
    fixed = fixed.replace(/[‘’]/g, "'");
    fixes.push("smart_quotes_replaced");
  }
  if (/[“”]/.test(fixed)) {
    fixed = fixed.replace(/[“”]/g, '"');
    if (!fixes.includes("smart_quotes_replaced")) {
      fixes.push("smart_quotes_replaced");
    }
  }
  if (/…/.test(fixed)) {
    fixed = fixed.replace(/…/g, "...");
    fixes.push("ellipsis_replaced");
  }

  // If the blog has the em-dash-free quirk, also flag hyphen-as-pause patterns
  // (no auto-fix — too ambiguous, must be rewritten).
  if (hasEmDashFreeQuirk) {
    const hyphenPause = fixed.match(/(\s)-\s/g);
    if (hyphenPause && hyphenPause.length > 0) {
      violations.push({
        kind: "vocab_violation",
        severity: "medium",
        layer: "1C",
        detail: "Hyphen used as pause — voice has em-dash-free quirk",
        matches: hyphenPause.slice(0, 5),
      });
    }
  }

  return { content: fixed, fixes, violations };
}

// ── 1D: Tag whitelist ──────────────────────────────────────────────────────

const ALWAYS_STRIP = new Set(["img", "figure", "picture", "figcaption", "source", "br", "hr"]);
const ALWAYS_UNWRAP = new Set(["div", "span", "section", "article", "header", "footer", "main", "aside", "nav"]);

function applyTagWhitelist(
  content: string,
  profile: StyleProfile,
): { content: string; fixes: FixApplied[]; violations: Violation[]; terminal: boolean } {
  const allowed = new Set(TAG_SETS[profile.tagSetId].allowedTags);
  const fixes: FixApplied[] = [];
  const violations: Violation[] = [];

  let fixed = content;

  // Strip images and adjacent always-strip tags
  for (const tag of ALWAYS_STRIP) {
    const re = new RegExp(`<${tag}\\b[^>]*\\/?>(?:[\\s\\S]*?<\\/${tag}>)?`, "gi");
    if (re.test(fixed)) {
      fixed = fixed.replace(re, "");
      if (!fixes.includes("tag_stripped")) fixes.push("tag_stripped");
    }
  }

  // Unwrap structural wrappers
  for (const tag of ALWAYS_UNWRAP) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    if (re.test(fixed)) {
      fixed = fixed.replace(re, "$1");
      if (!fixes.includes("tag_unwrapped")) fixes.push("tag_unwrapped");
    }
  }

  // Tag set 6 is special — no headings allowed. If any appear, terminal.
  const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
  if (profile.tagSetId === HEADERLESS_TAG_SET_ID) {
    for (const h of HEADING_TAGS) {
      const re = new RegExp(`<${h}\\b`, "i");
      if (re.test(fixed)) {
        violations.push({
          kind: "structural_mismatch_headerless",
          severity: "critical",
          layer: "1D",
          detail: `Tag set 6 (headerless) but <${h}> present — full regenerate required`,
          loc: `tag_${h}`,
        });
        return { content: fixed, fixes, violations, terminal: true };
      }
    }
  }

  // For non-headerless: convert disallowed headings to allowed alternatives.
  for (const h of HEADING_TAGS) {
    if (allowed.has(h)) continue;
    const open = new RegExp(`<${h}\\b[^>]*>`, "gi");
    const close = new RegExp(`<\\/${h}>`, "gi");
    if (open.test(fixed) || close.test(fixed)) {
      // Pick the nearest allowed heading, or wrap in <p><strong> if none.
      const fallback = HEADING_TAGS.filter((x) => allowed.has(x))[0];
      if (fallback) {
        fixed = fixed.replace(open, `<${fallback}>`).replace(close, `</${fallback}>`);
      } else {
        fixed = fixed.replace(open, "<p><strong>").replace(close, "</strong></p>");
      }
      if (!fixes.includes("tag_unwrapped")) fixes.push("tag_unwrapped");
    }
  }

  // Detect any remaining truly-unknown tags
  const remainingTags = new Set<string>();
  const tagRe = /<([a-z][a-z0-9]*)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(fixed))) {
    remainingTags.add(m[1].toLowerCase());
  }
  for (const t of remainingTags) {
    if (
      !allowed.has(t) &&
      !ALWAYS_STRIP.has(t) &&
      !ALWAYS_UNWRAP.has(t) &&
      !HEADING_TAGS.includes(t)
    ) {
      violations.push({
        kind: "schema_violation",
        severity: "high",
        layer: "1D",
        detail: `Tag <${t}> not in whitelist`,
        loc: `tag_${t}`,
      });
    }
  }

  return { content: fixed, fixes, violations, terminal: false };
}

// ── 1F: Word count ─────────────────────────────────────────────────────────

function checkWordCount(plainText: string, profile: StyleProfile): Violation[] {
  const wc = countWords(plainText);
  const violations: Violation[] = [];

  if (wc < profile.wordBandMin) {
    violations.push({
      kind: "word_count_under",
      severity: "high",
      layer: "1F",
      detail: `Word count ${wc} is below minimum ${profile.wordBandMin}`,
      loc: `wc_${wc}`,
    });
  } else if (wc > profile.wordBandMax * 1.1) {
    violations.push({
      kind: "word_count_over",
      severity: "high",
      layer: "1F",
      detail: `Word count ${wc} exceeds maximum ${profile.wordBandMax} (>110%)`,
      loc: `wc_${wc}`,
    });
  } else if (wc > profile.wordBandMax) {
    // Within soft-trim zone
    violations.push({
      kind: "word_count_over",
      severity: "low",
      layer: "1F",
      detail: `Word count ${wc} slightly over ${profile.wordBandMax}`,
      loc: `wc_${wc}`,
    });
  }
  return violations;
}

// ── 1G: Compliance phrase ──────────────────────────────────────────────────

function checkCompliancePlacement(
  content: string,
  plainText: string,
  profile: StyleProfile,
): { violations: Violation[]; fixes: FixApplied[]; content: string } {
  const violations: Violation[] = [];
  const fixes: FixApplied[] = [];
  let nextContent = content;

  const assignedPhrases = profile.compliancePhraseIds
    .map((id) => COMPLIANCE_PHRASES[id]?.text)
    .filter((t): t is string => Boolean(t));

  if (assignedPhrases.length === 0) {
    return { violations, fixes, content: nextContent };
  }

  // Helper: does the haystack contain any assigned phrase verbatim?
  const containsAny = (haystack: string): string | null => {
    for (const phrase of assignedPhrases) {
      if (haystack.includes(phrase)) return phrase;
    }
    return null;
  };

  const placement = profile.compliancePlacement;

  if (placement === "ABOUT_ONLY") {
    // Phrase must NOT appear in body content. Drift = phrase present.
    if (containsAny(plainText)) {
      violations.push({
        kind: "compliance_drift",
        severity: "medium",
        layer: "1G",
        detail: "Compliance phrase appears in body but placement is ABOUT_ONLY",
      });
    }
    return { violations, fixes, content: nextContent };
  }

  const firstWindow = plainText.slice(0, 250);
  const lastWindow = plainText.slice(-250);
  const total = plainText.length;
  const middleSlice = plainText.slice(
    Math.floor(total * 0.2),
    Math.floor(total * 0.8),
  );

  const hasTop = containsAny(firstWindow);
  const hasBottom = containsAny(lastWindow);
  const hasMiddle = containsAny(middleSlice);
  const hasAnywhere = containsAny(plainText);

  // Drift check: phrase present that's not in the assigned set
  // Only triggers if the article references compliance-style language at all.
  // Simple heuristic: check for typical disclaimer phrases.
  const looksLikeCompliance = /\b(not\s+medical\s+advice|research\s+(only|purposes)|consult.*physician|not\s+intended\s+as\s+guidance)\b/i.test(
    plainText,
  );
  if (looksLikeCompliance && !hasAnywhere) {
    violations.push({
      kind: "compliance_drift",
      severity: "high",
      layer: "1G",
      detail:
        "Compliance-style language detected but none of the assigned phrases appear verbatim",
    });
  }

  // The simplest auto-fix: append an assigned phrase to bottom of HTML. We do
  // this only for TOP / BOTTOM / TOP_AND_BOTTOM since INLINE / ROTATING need
  // semantic integration.
  const phraseToInject = assignedPhrases[0];
  const wrapPhrase = `<p><em>${phraseToInject}</em></p>`;

  if (placement === "TOP" || placement === "TOP_AND_BOTTOM") {
    if (!hasTop) {
      violations.push({
        kind: "compliance_missing",
        severity: "low",
        layer: "1G",
        detail: `Compliance phrase missing at TOP — auto-inserted`,
      });
      nextContent = wrapPhrase + "\n" + nextContent;
      fixes.push("compliance_inserted_top");
    }
  }

  if (placement === "BOTTOM" || placement === "TOP_AND_BOTTOM") {
    if (!hasBottom) {
      violations.push({
        kind: "compliance_missing",
        severity: "low",
        layer: "1G",
        detail: `Compliance phrase missing at BOTTOM — auto-inserted`,
      });
      nextContent = nextContent + "\n" + wrapPhrase;
      fixes.push("compliance_inserted_bottom");
    }
  }

  if (placement === "INLINE") {
    if (!hasMiddle) {
      violations.push({
        kind: "compliance_missing",
        severity: "medium",
        layer: "1G",
        detail: "Compliance phrase missing INLINE — semantic rewrite needed",
      });
    }
  }

  if (placement === "ROTATING") {
    if (!hasTop && !hasMiddle && !hasBottom) {
      violations.push({
        kind: "compliance_missing",
        severity: "medium",
        layer: "1G",
        detail: "No assigned compliance phrase appears anywhere in the article",
      });
    }
  }

  return { violations, fixes, content: nextContent };
}

// ── Orchestrator ──────────────────────────────────────────────────────────

/**
 * Run all of Layer 1 deterministically. Returns the auto-fixed content plus
 * the violations + fixes report. `terminal` means downstream layers should
 * be skipped and the post regenerated.
 *
 * Execution order:
 *   1C punctuation → 1D tag whitelist → 1A vocab → 1B phrases → 1F word count → 1G compliance
 *
 * Word count runs AFTER tag stripping so it measures actual prose, not
 * inflated by phantom-tag whitespace.
 */
export function runLayer1(
  content: string,
  profile: StyleProfile,
): Layer1Output {
  const violations: Violation[] = [];
  const fixes: FixApplied[] = [];
  let working = content;

  const hasEmDashFreeQuirk = profile.quirks.includes(3);

  // 1C — punctuation auto-fix
  {
    const r = applyPunctuationFixes(working, hasEmDashFreeQuirk);
    working = r.content;
    fixes.push(...r.fixes);
    violations.push(...r.violations);
  }

  // 1D — tag whitelist
  {
    const r = applyTagWhitelist(working, profile);
    working = r.content;
    fixes.push(...r.fixes);
    violations.push(...r.violations);
    if (r.terminal) {
      return { content: working, violations, fixesApplied: fixes, terminal: true };
    }
  }

  const plain = stripHtmlToPlainText(working);

  // 1A vocab
  violations.push(...checkVocab(plain));

  // 1B phrase
  violations.push(...checkPhrases(plain));

  // 1F word count
  violations.push(...checkWordCount(plain, profile));

  // 1G compliance
  {
    const r = checkCompliancePlacement(working, plain, profile);
    working = r.content;
    fixes.push(...r.fixes);
    violations.push(...r.violations);
  }

  return { content: working, violations, fixesApplied: fixes, terminal: false };
}

// Re-export helpers used by Layer 2
export { paragraphsFromHtml, stripHtmlToPlainText, countWords };
