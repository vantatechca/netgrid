import type { Archetype, ArchetypeId } from "../types";

/**
 * 12 voice archetypes. Voice ranges partition the 77 voices into archetype
 * bands. The bands are intentionally uneven — archetypes that fit more
 * sub-niches naturally (A1 research translator) carry more voices than thin
 * archetypes (A12 industry analyst).
 *
 * Voice ID partition (77 total):
 *   A1  research translator       1–10   (10)
 *   A2  gym observer              11–18   (8)
 *   A3  biohacker observer        19–24   (6)
 *   A4  skeptical clinician       25–31   (7)
 *   A5  beginner explainer        32–39   (8)
 *   A6  compounding pharmacy      40–44   (5)
 *   A7  anti-aging philosopher    45–50   (6)
 *   A8  female health             51–55   (5)
 *   A9  sports medicine           56–60   (5)
 *   A10 E. European translator    61–65   (5)
 *   A11 compliance-paranoid       66–71   (6)
 *   A12 industry analyst          72–77   (6)
 *
 * Strictness defaults follow the table from Batch 6.
 */
export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  1: {
    id: 1,
    key: "research_translator",
    name: "Research Translator",
    description:
      "Writers who turn published research into accessible prose — citation-heavy, hedged, careful with mechanism claims.",
    voiceRange: [1, 10],
    defaultStrictness: "standard",
  },
  2: {
    id: 2,
    key: "gym_observer",
    name: "Gym Observer",
    description:
      "Writers in or adjacent to lifting / training culture — practical observations, less formal register, anecdote-leaning but research-frame.",
    voiceRange: [11, 18],
    defaultStrictness: "standard",
  },
  3: {
    id: 3,
    key: "biohacker_observer",
    name: "Biohacker Observer",
    description:
      "Self-experimenter cultural framing — community discourse, n=1 observation, careful to avoid prescription language.",
    voiceRange: [19, 24],
    defaultStrictness: "loose",
  },
  4: {
    id: 4,
    key: "skeptical_clinician",
    name: "Skeptical Clinician",
    description:
      "Medical-adjacent skeptic — reads research like a clinician, flags weak evidence, hedges aggressively.",
    voiceRange: [25, 31],
    defaultStrictness: "standard",
  },
  5: {
    id: 5,
    key: "beginner_explainer",
    name: "Beginner Explainer",
    description:
      "Onboarding voice — defines terms inline, walks through basics, never assumes prior knowledge.",
    voiceRange: [32, 39],
    defaultStrictness: "standard",
  },
  6: {
    id: 6,
    key: "compounding_pharmacy",
    name: "Compounding Pharmacy",
    description:
      "Technical pharmacology framing — reconstitution math, stability, vial-handling. Strict compliance because of the dose-implication risk.",
    voiceRange: [40, 44],
    defaultStrictness: "strict",
  },
  7: {
    id: 7,
    key: "anti_aging_philosopher",
    name: "Anti-aging Philosopher",
    description:
      "Longevity-frame essayist — mechanism-meditative, cites Russian and longevity literature, reflective cadence.",
    voiceRange: [45, 50],
    defaultStrictness: "standard",
  },
  8: {
    id: 8,
    key: "female_health",
    name: "Female Health",
    description:
      "Hormonal-cycle and female-physiology aware — distinguishes mechanisms relevant to female users from generic protocols.",
    voiceRange: [51, 55],
    defaultStrictness: "standard",
  },
  9: {
    id: 9,
    key: "sports_medicine",
    name: "Sports Medicine",
    description:
      "Performance and recovery angle — injury rehab, athletic context, careful with implied therapeutic claims.",
    voiceRange: [56, 60],
    defaultStrictness: "standard",
  },
  10: {
    id: 10,
    key: "eastern_european_translator",
    name: "Eastern European Translator",
    description:
      "Voice that translates Russian / Ukrainian peptide literature into English — slight non-native register, references regional clinical work.",
    voiceRange: [61, 65],
    defaultStrictness: "standard",
  },
  11: {
    id: 11,
    key: "compliance_paranoid",
    name: "Compliance Paranoid",
    description:
      "Regulatory-frame writer — disclaimers, hedges, research-information-only framing baked into every paragraph.",
    voiceRange: [66, 71],
    defaultStrictness: "strict",
  },
  12: {
    id: 12,
    key: "industry_analyst",
    name: "Industry Analyst",
    description:
      "Journalistic register — covers news, regulatory shifts, market context. Magazine cadence, structured analysis.",
    voiceRange: [72, 77],
    defaultStrictness: "standard",
  },
};

export const ARCHETYPE_IDS: ArchetypeId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function archetypeById(id: ArchetypeId): Archetype {
  return ARCHETYPES[id];
}

export function archetypeForVoice(voiceId: number): ArchetypeId {
  for (const a of Object.values(ARCHETYPES)) {
    if (voiceId >= a.voiceRange[0] && voiceId <= a.voiceRange[1]) return a.id;
  }
  // Out-of-range — default to A1
  return 1;
}
