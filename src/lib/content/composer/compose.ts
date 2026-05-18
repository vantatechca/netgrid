import type { StructuralTemplate, StyleProfile, TemplateId } from "../types";
import { CADENCES } from "../libraries/cadences";
import { CITATION_STYLES } from "../libraries/citation-styles";
import { COMPLIANCE_PHRASES } from "../libraries/compliance-phrases";
import { QUIRKS } from "../libraries/quirks";
import { SCHEMAS } from "../libraries/schemas";
import { SKELETONS } from "../libraries/skeletons";
import { SUB_NICHES } from "../libraries/sub-niches";
import { TAG_SETS } from "../libraries/tag-sets";
import { TEMPLATES, WEIRD_IDS, WORKHORSE_IDS } from "../libraries/templates";
import { VOICES } from "../libraries/voices";
import { SeededRng } from "../assignment/draw-helpers";
import { inlineSharedBlocks } from "./shared-blocks";

/**
 * Per-post template selection from the blog's locked structural pool.
 *
 * Weights (from Batch 4 closeout):
 *   60% workhorse
 *   25% weird
 *   15% niche-natural (template explicitly fits the blog's sub-niche
 *        archetype)
 *
 * When a bucket is empty, weight redistributes proportionally to the others.
 */
export function pickTemplateForPost(
  rng: SeededRng,
  profile: StyleProfile,
): StructuralTemplate {
  const pool = profile.structuralPool;
  const workhorse = pool.filter((id) => WORKHORSE_IDS.includes(id));
  const weird = pool.filter((id) => WEIRD_IDS.includes(id));
  const nicheNatural = pool.filter((id) => {
    const t = TEMPLATES[id];
    return t.subNicheFit.includes(profile.subNicheId);
  });

  // Build weighted candidate set. A template can appear in multiple buckets,
  // so dedupe at pick time.
  const buckets: Array<{ ids: TemplateId[]; weight: number }> = [
    { ids: workhorse, weight: 0.60 },
    { ids: weird, weight: 0.25 },
    { ids: nicheNatural, weight: 0.15 },
  ];

  // Drop empty buckets and renormalise
  const active = buckets.filter((b) => b.ids.length > 0);
  if (active.length === 0) {
    // Pool is empty / corrupt — fall back to all templates
    return TEMPLATES[1];
  }
  const totalWeight = active.reduce((sum, b) => sum + b.weight, 0);

  const r = rng.next() * totalWeight;
  let acc = 0;
  let chosenBucket = active[active.length - 1];
  for (const b of active) {
    acc += b.weight;
    if (r <= acc) {
      chosenBucket = b;
      break;
    }
  }

  const tid = chosenBucket.ids[Math.floor(rng.next() * chosenBucket.ids.length)];
  return TEMPLATES[tid];
}

// ─── Placeholder rendering ─────────────────────────────────────────────────

function renderFlow(template: StructuralTemplate): string {
  return template.flow.map((s, i) => `${i + 1}. ${s.label}`).join(" → ");
}

function renderFlowAsOutline(
  template: StructuralTemplate,
  wordBandTotal: number,
): string {
  return template.flow
    .map((s, i) => {
      const approx = Math.round(s.approxWordsWeight * wordBandTotal);
      const g = s.guidance ? `: ${s.guidance}` : "";
      return `${i + 1}. ${s.label} (~${approx} words)${g}`;
    })
    .join("\n");
}

function renderQuirks(profile: StyleProfile): string {
  return profile.quirks
    .map((qid) => QUIRKS[qid]?.promptInstruction)
    .filter((s): s is string => Boolean(s))
    .join(" / ");
}

function renderCompliancePhrases(profile: StyleProfile): string {
  if (!profile.compliancePhraseIds || profile.compliancePhraseIds.length === 0) {
    return "(no compliance phrase required for this niche)";
  }
  return profile.compliancePhraseIds
    .map((id) => COMPLIANCE_PHRASES[id]?.text)
    .filter((s): s is string => Boolean(s))
    .map((s) => `"${s}"`)
    .join(" OR ");
}

function hasCompliance(profile: StyleProfile): boolean {
  return Array.isArray(profile.compliancePhraseIds) && profile.compliancePhraseIds.length > 0;
}

function effectivePlacement(
  profile: StyleProfile,
  template: StructuralTemplate,
): string {
  return template.compliancePlacementOverride ?? profile.compliancePlacement;
}

// ─── Main compose ──────────────────────────────────────────────────────────

export interface ComposeInput {
  profile: StyleProfile;
  topic: string;
  /** Optional pre-rolled template (for testing / retry). */
  templateOverride?: StructuralTemplate;
  /** Used for question-driven skeleton S8 — composer pre-converts topic. */
  questionAboutTopic?: string;
  /** PRNG seed for per-post template selection. Defaults to topic. */
  seed?: string;
  /**
   * The blog's actual free-text niche string (e.g. "gym marketing",
   * "real estate", "dental practice"). When the profile's niche is
   * "universal" (catches any unregistered niche), this is substituted
   * into the {sub_niche} placeholder so Claude still receives
   * topical context. Ignored for peptide and other registered niches —
   * those use the SUB_NICHES name directly.
   */
  nicheLabel?: string | null;
}

export interface ComposeResult {
  systemPrompt: string;
  userPrompt: string;
  /** Recorded for the scrubber and analytics. */
  template: StructuralTemplate;
  /** Effective compliance placement, considering template overrides. */
  effectiveCompliancePlacement: string;
  /** Word band actually used (may be tightened from profile by template). */
  wordBand: [number, number];
}

/**
 * Render the full system + user prompt for one post against a locked style
 * profile and a topic. The composer pulls the locked skeleton, picks one
 * template from the structural pool, substitutes every placeholder, and
 * inlines shared blocks.
 *
 * Per-post variability comes from template draw, not skeleton draw — the
 * skeleton is locked at the blog level.
 */
export function composeForPost(input: ComposeInput): ComposeResult {
  const rng = new SeededRng(input.seed ?? input.topic);
  const profile = input.profile;
  const skeleton = SKELETONS[profile.skeletonId];
  if (!skeleton) {
    throw new Error(`Skeleton id ${profile.skeletonId} not found`);
  }

  const template = input.templateOverride ?? pickTemplateForPost(rng, profile);

  const voice = VOICES[profile.voiceId];
  const cadence = CADENCES[profile.cadenceId];
  const citation = CITATION_STYLES[profile.citationStyleId];
  const schema = SCHEMAS[profile.schemaId];
  const tagSet = TAG_SETS[profile.tagSetId];
  const subNiche = SUB_NICHES[profile.subNicheId];

  const wordBandMin = profile.wordBandMin;
  const wordBandMax = profile.wordBandMax;
  const wordBandTarget = Math.round((wordBandMin + wordBandMax) / 2);
  const placement = effectivePlacement(profile, template);
  const phrasesRendered = renderCompliancePhrases(profile);

  // For the universal niche (sub-niche 25 / nicheKey "universal") the blog's
  // free-text niche label gives more topical context than the generic
  // "General Content" sub-niche name. Substitute it directly so Claude
  // sees e.g. "gym marketing" or "real estate" in the prompt.
  const isUniversal =
    profile.nicheKey === "universal" || profile.subNicheId === 25;
  const subNicheLabel =
    isUniversal && input.nicheLabel && input.nicheLabel.trim().length > 0
      ? input.nicheLabel.trim()
      : subNiche.name;

  // S8 requires a pre-rolled question. If absent, synthesize a default form.
  const questionAboutTopic =
    input.questionAboutTopic ??
    `What does current research show about ${input.topic}, and where is the evidence weak?`;

  // ── Placeholder substitution ──
  // Order matters slightly — replace longer placeholders first so we don't
  // accidentally consume a substring.
  const substitutions: Array<[string, string]> = [
    ["{voice.persona}", voice.persona],
    ["{voice.register_signature}", voice.registerSignature],
    ["{voice.example_paragraph_1}", voice.examplePara1 ?? "(example paragraph not yet provided for this voice)"],
    ["{voice.example_paragraph_2}", voice.examplePara2 ?? "(example paragraph not yet provided for this voice)"],
    ["{cadence.numbers.avgWords}", String(cadence.numbers.avgWords)],
    ["{cadence.numbers.stdDev}", String(cadence.numbers.stdDev)],
    ["{cadence.numbers.shortExample}", String(cadence.numbers.shortExample)],
    ["{cadence.numbers.longExample}", String(cadence.numbers.longExample)],
    ["{cadence.numbers.avgParagraph}", String(cadence.numbers.avgParagraph)],
    ["{cadence.voiceDirection}", cadence.voiceDirection],
    ["{cadence.transitionDensity}", cadence.transitionDensity],
    ["{cadence.spec}", cadence.spec],
    ["{citation.style_description}", citation.styleDescription],
    ["{citation.example}", citation.example],
    ["{schema.json}", schema.jsonSpec],
    ["{tag_set.allowed_tags}", `<${tagSet.allowedTags.join(">, <")}>`],
    ["{compliance.placement}", placement],
    ["{compliance.phrases_rendered}", phrasesRendered],
    ["{template.flow_as_outline}", renderFlowAsOutline(template, wordBandTarget)],
    ["{template.flow}", renderFlow(template)],
    ["{primary_compounds}", profile.primaryCompounds.join(", ")],
    ["{secondary_compounds}", profile.secondaryCompounds.join(", ")],
    ["{sub_niche}", subNicheLabel],
    ["{word_band_min}", String(wordBandMin)],
    ["{word_band_max}", String(wordBandMax)],
    ["{word_band_target}", String(wordBandTarget)],
    ["{topic}", input.topic],
    ["{quirks_rendered}", renderQuirks(profile)],
    ["{question_about_topic}", questionAboutTopic],
  ];

  let body = skeleton.body;
  for (const [needle, value] of substitutions) {
    body = body.split(needle).join(value);
  }

  // Inline shared blocks
  body = inlineSharedBlocks(body);

  // Final pass — substitute again in case shared blocks introduced placeholders
  for (const [needle, value] of substitutions) {
    body = body.split(needle).join(value);
  }

  return {
    systemPrompt: body,
    userPrompt: `Write the article now. Topic: ${input.topic}. Return ONLY the JSON object — no prose before or after.`,
    template,
    effectiveCompliancePlacement: placement,
    wordBand: [wordBandMin, wordBandMax],
  };
}
