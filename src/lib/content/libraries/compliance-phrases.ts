import type { CompliancePhrase, CompliancePhraseId } from "../types";

/**
 * 40 compliance phrases for peptide content. Phrases must:
 *   - Frame as research / research-information only
 *   - Not recommend personal use
 *   - Not suggest doses for human consumption
 *   - Not compare peptides to approved medications as interchangeable
 *
 * Each phrase has a `syntacticShape` so the assignment algorithm can pull 2-3
 * phrases that are SYNTACTICALLY distinct (avoids a blog with three phrases
 * all starting "This article is …").
 *
 * Phrase 16 is the special strict-tier-only phrase — included for the
 * `phrase_16_requiresStrictness` rule from Batch 7.
 */
export const COMPLIANCE_PHRASES: Record<CompliancePhraseId, CompliancePhrase> = {
  1: { id: 1, text: "This article discusses peptides as research compounds. It is not medical advice.", syntacticShape: "declarative_statement" },
  2: { id: 2, text: "The information below summarises published research and is not intended as guidance for personal use.", syntacticShape: "declarative_statement" },
  3: { id: 3, text: "Peptides referenced here are research chemicals. Their use outside of approved clinical settings is not endorsed.", syntacticShape: "declarative_two_clause" },
  4: { id: 4, text: "Nothing in this article constitutes medical advice or a recommendation for self-administration.", syntacticShape: "negation_constitutes" },
  5: { id: 5, text: "All references to dosing in this article describe protocols used in published studies, not recommendations for individuals.", syntacticShape: "qualifier_describes" },
  6: { id: 6, text: "Readers should consult a qualified clinician before considering any compound discussed in this article.", syntacticShape: "imperative_should" },
  7: { id: 7, text: "Where research is preliminary, this is flagged in the text. Absence of long-term human data should be assumed for most peptides covered here.", syntacticShape: "declarative_two_clause" },
  8: { id: 8, text: "This is an editorial discussion of published research. It is not a treatment plan.", syntacticShape: "declarative_two_clause" },
  9: { id: 9, text: "The compounds named in this article are not approved for human therapeutic use in most jurisdictions.", syntacticShape: "qualifier_negation" },
  10: { id: 10, text: "Statements about mechanism describe pathways reported in published animal and in vitro work. Human evidence varies.", syntacticShape: "qualifier_describes" },
  11: { id: 11, text: "All data presented is sourced from publicly available scientific literature. No personal experience or testimonial is implied.", syntacticShape: "qualifier_negation" },
  12: { id: 12, text: "For research and educational purposes only.", syntacticShape: "short_purpose_only" },
  13: { id: 13, text: "We do not endorse or recommend the use of any peptide for any purpose other than legitimate research.", syntacticShape: "negation_endorse" },
  14: { id: 14, text: "Information here reflects published findings at the time of writing and may be superseded by newer research.", syntacticShape: "qualifier_temporal" },
  15: { id: 15, text: "Discussion of any compound's effects refers to outcomes observed in clinical or preclinical studies, not anecdotal reports.", syntacticShape: "qualifier_describes" },
  16: { id: 16, text: "This article is strictly informational. Possession, sale, or use of the substances discussed may be restricted under federal, state, or local law in your jurisdiction. Consult applicable regulations before any action.", syntacticShape: "regulatory_strict", strictnessRequired: "strict" },
  17: { id: 17, text: "The author has no financial relationship with any manufacturer, distributor, or reseller of compounds named in this article.", syntacticShape: "disclosure_negation" },
  18: { id: 18, text: "Mentions of brand or product names are for identification only and do not constitute endorsement.", syntacticShape: "qualifier_purpose" },
  19: { id: 19, text: "Specific dosages quoted in this article are taken from cited research protocols and are not prescriptive.", syntacticShape: "qualifier_describes" },
  20: { id: 20, text: "Long-term safety data for many peptides discussed here is limited. Risk profiles should be interpreted accordingly.", syntacticShape: "qualifier_temporal" },
  21: { id: 21, text: "Comparisons to FDA-approved medications in this article describe pharmacological similarity, not therapeutic interchangeability.", syntacticShape: "qualifier_describes" },
  22: { id: 22, text: "If you are pregnant, nursing, or under medical treatment, consult your physician before considering any compound covered in this article.", syntacticShape: "conditional_imperative" },
  23: { id: 23, text: "The discussion below is intended for individuals familiar with reading and interpreting biomedical research.", syntacticShape: "qualifier_audience" },
  24: { id: 24, text: "Self-administration of unapproved compounds carries risks that are not fully characterised in the published literature.", syntacticShape: "qualifier_risk" },
  25: { id: 25, text: "Outcomes described in studies cited here cannot be assumed to generalise to individual users.", syntacticShape: "qualifier_generalisation" },
  26: { id: 26, text: "Some compounds in this article are sold only as research chemicals and are not labelled for human consumption.", syntacticShape: "qualifier_negation" },
  27: { id: 27, text: "Researchers conducting independent work should follow institutional protocols and ethics review where applicable.", syntacticShape: "imperative_should" },
  28: { id: 28, text: "No content in this article should be interpreted as personalised medical guidance.", syntacticShape: "negation_should" },
  29: { id: 29, text: "Mechanistic claims discussed here may be based on animal studies, in vitro experiments, or theoretical models. Each section indicates the evidence type.", syntacticShape: "declarative_two_clause" },
  30: { id: 30, text: "Treatment of any condition is outside the scope of this article. Diagnosis and care should be conducted by a licensed practitioner.", syntacticShape: "declarative_two_clause" },
  31: { id: 31, text: "Where this article references real research, citations are provided so that readers may evaluate the underlying evidence directly.", syntacticShape: "qualifier_describes" },
  32: { id: 32, text: "The author does not endorse vendors, sellers, or sources of any peptide discussed in this article.", syntacticShape: "negation_endorse" },
  33: { id: 33, text: "Regulatory status of peptides varies by country, state, and intended use; readers are responsible for verifying applicable rules.", syntacticShape: "regulatory_general" },
  34: { id: 34, text: "Doses cited from animal studies should not be scaled directly to humans without expert pharmacological input.", syntacticShape: "qualifier_negation" },
  35: { id: 35, text: "This is general educational content. Personal health decisions should involve a qualified clinician familiar with your medical history.", syntacticShape: "declarative_two_clause" },
  36: { id: 36, text: "References to off-label or research-only use describe what has been reported in the scientific literature, not what is recommended.", syntacticShape: "qualifier_describes" },
  37: { id: 37, text: "Specific outcomes referenced from studies represent observed effects in defined populations under defined conditions.", syntacticShape: "qualifier_describes" },
  38: { id: 38, text: "We make no representation about the suitability of any compound covered here for any particular purpose.", syntacticShape: "negation_representation" },
  39: { id: 39, text: "Side-effect and adverse-event data for many peptides is sparse. Absence of reported harm does not equate to absence of risk.", syntacticShape: "declarative_two_clause" },
  40: { id: 40, text: "Always verify dosing and protocol details against the cited primary source before using them as a reference point in your own research.", syntacticShape: "imperative_always" },

  // ─── Gambling-specific compliance (IDs 41-44) ─────────────────────────────
  41: { id: 41, text: "Gambling involves risk. Bet only what you can afford to lose. Most bettors lose money long-term.", syntacticShape: "imperative_risk_disclosure" },
  42: { id: 42, text: "This article is for informational purposes. It is not advice to place any specific wager.", syntacticShape: "declarative_purpose" },
  43: { id: 43, text: "Must be 18+ (or 21+ in some jurisdictions) to participate in real-money gambling. Verify local laws before betting.", syntacticShape: "regulatory_age" },
  44: { id: 44, text: "If gambling is affecting your wellbeing or finances, contact the National Council on Problem Gambling at 1-800-GAMBLER.", syntacticShape: "support_resource" },
};

export const COMPLIANCE_PHRASE_IDS: CompliancePhraseId[] = Array.from(
  { length: 44 },
  (_, i) => i + 1,
);

export function compliancePhraseById(id: CompliancePhraseId): CompliancePhrase {
  return COMPLIANCE_PHRASES[id];
}

/**
 * Distribution weights for `compliance_placement` (Phase 10).
 */
export const PLACEMENT_DISTRIBUTION: Record<
  "TOP" | "BOTTOM" | "TOP_AND_BOTTOM" | "INLINE" | "ABOUT_ONLY" | "ROTATING",
  number
> = {
  TOP: 0.25,
  BOTTOM: 0.25,
  TOP_AND_BOTTOM: 0.10,
  INLINE: 0.15,
  ABOUT_ONLY: 0.15,
  ROTATING: 0.10,
};
