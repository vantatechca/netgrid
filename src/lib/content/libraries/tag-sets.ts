import type { TagSet, TagSetId } from "../types";

/**
 * 6 HTML tag whitelists. The scrubber's Layer 1D enforces these — any tag not
 * in `allowedTags` gets stripped or unwrapped. Tag set 6 is the special
 * conversational set with NO headings — if a heading slips through, the
 * scrubber triggers a full regenerate (structural mismatch).
 */
export const TAG_SETS: Record<TagSetId, TagSet> = {
  1: {
    id: 1,
    name: "Minimal",
    allowedTags: ["p", "strong", "em", "a"],
    description: "Prose-only with inline emphasis. No headings, no lists.",
  },
  2: {
    id: 2,
    name: "Standard",
    allowedTags: ["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "a"],
    description: "The default article whitelist. H2/H3 hierarchy plus lists.",
  },
  3: {
    id: 3,
    name: "Standard with blockquote",
    allowedTags: ["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "a", "blockquote"],
    description: "Standard plus blockquote — for voices that quote sources frequently.",
  },
  4: {
    id: 4,
    name: "Technical",
    allowedTags: [
      "h2",
      "h3",
      "h4",
      "p",
      "ul",
      "ol",
      "li",
      "strong",
      "em",
      "a",
      "code",
      "pre",
      "blockquote",
    ],
    description: "Adds H4, code, and pre — for compounding/reconstitution voices that show formulas.",
  },
  5: {
    id: 5,
    name: "Reference",
    allowedTags: [
      "h2",
      "h3",
      "h4",
      "p",
      "ul",
      "ol",
      "li",
      "strong",
      "em",
      "a",
      "dl",
      "dt",
      "dd",
      "code",
    ],
    description: "Adds definition list — for glossary and reference-style voices.",
  },
  6: {
    id: 6,
    name: "Conversational (no headings)",
    allowedTags: ["p", "strong", "em", "a"],
    description:
      "Headerless prose. If any heading tag appears in output, the scrubber treats it as a structural mismatch and regenerates.",
  },
};

export const TAG_SET_IDS: TagSetId[] = [1, 2, 3, 4, 5, 6];

/**
 * Distribution weights used by Phase 5 of the assignment algorithm.
 */
export const TAG_SET_DISTRIBUTION: Record<TagSetId, number> = {
  1: 0.12,
  2: 0.28,
  3: 0.18,
  4: 0.18,
  5: 0.14,
  6: 0.10,
};

export function tagSetById(id: TagSetId): TagSet {
  return TAG_SETS[id];
}

/**
 * Tag set 6 — no headings allowed. Used by Layer 1D scrubber as a sentinel.
 */
export const HEADERLESS_TAG_SET_ID: TagSetId = 6;
