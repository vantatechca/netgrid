import type { CadenceId, CadenceSpec } from "../types";

/**
 * 14 cadences. Each one defines the prose rhythm a voice writes at — average
 * sentence length, paragraph length, transition density, and a one-line voice
 * direction injected into prompts.
 *
 * These numeric specs feed two systems:
 *   1. Skeleton S10 (Voice-and-Rhythm-Emphasis) renders them inline
 *   2. Layer 2A/2B/2E scrubber checks measure the post against them
 *
 * `transitionDensity` maps to the Layer 2E table:
 *   none    → 0-2 transitions per 1000 words
 *   low     → 0-3
 *   medium  → 4-7
 *   high    → 8+
 */
export const CADENCES: Record<CadenceId, CadenceSpec> = {
  1: {
    id: 1,
    name: "Standard analytical",
    spec: "Even, declarative sentences averaging around 18 words. Paragraphs of 3-5 sentences. Sparse transitions.",
    numbers: { avgWords: 18, stdDev: 6, shortExample: 9, longExample: 30, avgParagraph: 4 },
    voiceDirection: "Even pacing, declarative, no rhetorical pivots",
    transitionDensity: "low",
  },
  2: {
    id: 2,
    name: "Hedged academic",
    spec: "Longer sentences (22-26 words) with frequent hedging. Paragraphs of 4-6 sentences.",
    numbers: { avgWords: 24, stdDev: 7, shortExample: 12, longExample: 38, avgParagraph: 5 },
    voiceDirection: "Hedged, qualified, academic register",
    transitionDensity: "medium",
  },
  3: {
    id: 3,
    name: "Punchy short-form",
    spec: "Sentences average 12 words. Some single-sentence paragraphs. Direct, no hedging unless required.",
    numbers: { avgWords: 12, stdDev: 5, shortExample: 5, longExample: 22, avgParagraph: 2 },
    voiceDirection: "Punchy, direct, occasional single-sentence paragraph",
    transitionDensity: "low",
  },
  4: {
    id: 4,
    name: "Technical specification",
    spec: "Compact, structured sentences (15-18 words). Lists frequent. Paragraphs of 2-3 sentences.",
    numbers: { avgWords: 16, stdDev: 4, shortExample: 8, longExample: 24, avgParagraph: 3 },
    voiceDirection: "Compact, specification-oriented, list-friendly",
    transitionDensity: "none",
  },
  5: {
    id: 5,
    name: "Long-form essay",
    spec: "Variable sentences (avg 21) with high standard deviation. Paragraphs of 5-7 sentences. Reflective.",
    numbers: { avgWords: 21, stdDev: 11, shortExample: 6, longExample: 44, avgParagraph: 6 },
    voiceDirection: "Reflective, variable rhythm, paragraph-anchored thinking",
    transitionDensity: "none",
  },
  6: {
    id: 6,
    name: "Clinical brief",
    spec: "Tight 14-16 word sentences. Paragraphs of 2-4 sentences. Diagnostic tone.",
    numbers: { avgWords: 15, stdDev: 4, shortExample: 8, longExample: 22, avgParagraph: 3 },
    voiceDirection: "Diagnostic, tight, clinical-brief register",
    transitionDensity: "low",
  },
  7: {
    id: 7,
    name: "Forum energy",
    spec: "Mixed sentences (10-25 words) with conversational register. Paragraphs short (1-3 sentences).",
    numbers: { avgWords: 16, stdDev: 9, shortExample: 4, longExample: 28, avgParagraph: 2 },
    voiceDirection: "Conversational, forum-energy, willing to digress briefly",
    transitionDensity: "none",
  },
  8: {
    id: 8,
    name: "Magazine feature",
    spec: "Mid-length sentences (19-22 words) with descriptive runs. Paragraphs of 4-5 sentences.",
    numbers: { avgWords: 20, stdDev: 7, shortExample: 9, longExample: 32, avgParagraph: 4 },
    voiceDirection: "Magazine-feature pacing, descriptive, lightly narrative",
    transitionDensity: "medium",
  },
  9: {
    id: 9,
    name: "Methodical tutorial",
    spec: "Even 16-19 word sentences. Paragraphs of 3-4 sentences. Step-by-step register.",
    numbers: { avgWords: 17, stdDev: 5, shortExample: 9, longExample: 26, avgParagraph: 3 },
    voiceDirection: "Step-by-step, methodical, instruction-shaped",
    transitionDensity: "medium",
  },
  10: {
    id: 10,
    name: "Compliance-formal",
    spec: "Longer formal sentences (22-28 words). Paragraphs of 4-6 sentences. Disclaimer-rich.",
    numbers: { avgWords: 25, stdDev: 6, shortExample: 14, longExample: 38, avgParagraph: 5 },
    voiceDirection: "Formal, disclaimer-rich, regulatory register",
    transitionDensity: "high",
  },
  11: {
    id: 11,
    name: "Essay-meditative",
    spec: "Highly variable sentences (avg 22, SD 13). Long paragraphs (5-8 sentences). Reflective.",
    numbers: { avgWords: 22, stdDev: 13, shortExample: 5, longExample: 48, avgParagraph: 6 },
    voiceDirection: "Meditative, variable, paragraph-as-thought-unit",
    transitionDensity: "none",
  },
  12: {
    id: 12,
    name: "Newsroom",
    spec: "Lead-paragraph short, then 18-22 word sentences. Paragraphs of 2-4 sentences.",
    numbers: { avgWords: 19, stdDev: 8, shortExample: 7, longExample: 30, avgParagraph: 3 },
    voiceDirection: "News-room, lead-anchored, inverted-pyramid pacing",
    transitionDensity: "low",
  },
  13: {
    id: 13,
    name: "Q&A interview",
    spec: "Alternating short questions (8-12 words) and longer answers (20-28 words). Paragraphs of 1-3.",
    numbers: { avgWords: 17, stdDev: 10, shortExample: 6, longExample: 34, avgParagraph: 2 },
    voiceDirection: "Q&A rhythm, alternating compact questions with longer answers",
    transitionDensity: "none",
  },
  14: {
    id: 14,
    name: "Glossary-precise",
    spec: "Definitional sentences (16-20 words). Paragraphs of 2-3 sentences. Term-anchored.",
    numbers: { avgWords: 18, stdDev: 4, shortExample: 10, longExample: 26, avgParagraph: 2 },
    voiceDirection: "Term-anchored, definitional, precise",
    transitionDensity: "none",
  },
};

export const CADENCE_IDS: CadenceId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function cadenceById(id: CadenceId): CadenceSpec {
  return CADENCES[id];
}
