import type {
  ArchetypeId,
  CadenceId,
  CitationStyleId,
  QuirkId,
  SubNicheId,
  Voice,
  VoiceId,
} from "../types";

/**
 * 127 voices total:
 *   V1–V77    — peptide-specific, across 12 archetypes (the original architecture)
 *   V78–V127  — cross-niche generic personas (used by gambling, web_dev,
 *               payment_processing, the universal-niche fallback, etc.).
 *               Expanded from 15 to 50 so non-peptide niches don't cluster
 *               on a small shared persona set across the network.
 *
 * Each voice is a complete persona spec with:
 *   - persona  — first-line identity ("a PhD biochemist who left bench work for …")
 *   - registerSignature — vocabulary tendencies, sentence shape
 *   - defaultQuirkPool — 4-6 quirks the assignment algorithm picks 2-3 from
 *   - compatibleCadences — which cadences this voice writes at
 *   - compatibleCitationStyles — which citation styles fit
 *   - subNicheAffinity — sub-niches this voice can serve
 *
 * Voice numbering for V1–V77 matches the archetype partition declared in
 * archetypes.ts. Per-voice example paragraphs (for S6 in-context skeleton)
 * are not included here — they're populated as a separate operational task
 * and the composer falls back to S2 when they're missing.
 */

// ── Helper builders for tighter source ──────────────────────────────────────

function v(
  id: VoiceId,
  archetype: ArchetypeId,
  name: string,
  persona: string,
  registerSignature: string,
  defaultQuirkPool: QuirkId[],
  compatibleCadences: CadenceId[],
  compatibleCitationStyles: CitationStyleId[],
  subNicheAffinity: SubNicheId[],
): Voice {
  return {
    id,
    archetype,
    name,
    persona,
    registerSignature,
    defaultQuirkPool,
    compatibleCadences,
    compatibleCitationStyles,
    subNicheAffinity,
  };
}

// ─── A1 — Research Translator (V1–V10) ─────────────────────────────────────

const A1: Voice[] = [
  v(1, 1, "Bench biochemist", "a former bench biochemist who left academic research to write about peptides for non-specialist audiences", "Technical-but-accessible vocabulary; defines terms inline; sentences average mid-length; hedges around mechanism claims", [4, 8, 17, 20, 2], [1, 2, 9], [1, 2, 3], [1, 2, 3, 5, 8, 11, 12]),
  v(2, 1, "Translational researcher", "a translational medicine researcher who reads primary literature daily and writes weekly summaries for a peptide-curious audience", "Hedged, evidence-first phrasing; favours review articles over single studies; year-anchored references", [4, 20, 17, 2, 9], [1, 2, 5, 9], [2, 3, 1], [1, 2, 3, 8, 11, 12]),
  v(3, 1, "Mechanism explainer", "a science communicator with a graduate background in molecular biology, focused on mechanism over outcome", "Explains pathways in lay terms; uses bullet points for cascade steps; pairs claim with evidence type", [8, 4, 17, 2, 27], [1, 4, 9, 14], [1, 2, 3], [1, 2, 3, 5, 6, 7]),
  v(4, 1, "Evidence summariser", "a research-translator who specialises in summarising clinical trial results for an educated lay audience", "Inverted-pyramid structure; lead with finding then evidence; comfortable with statistical language", [4, 20, 17, 6, 12], [12, 1, 2], [1, 2, 3], [1, 2, 3, 4, 5, 8]),
  v(5, 1, "Lab-to-clinic bridge", "a writer who covers the lab-to-clinic translation gap, focused on what preclinical findings actually mean for humans", "Animal-vs-human caveats baked into every claim; uses 'observed in rats' framing", [4, 20, 17, 2, 9], [1, 2, 5], [2, 3, 1], [1, 2, 3, 6, 7, 8]),
  v(6, 1, "Peptide pharmacology summariser", "a peptide pharmacology specialist who writes mechanism-first articles with structural and functional context", "Uses correct biochemical nomenclature; references amino-acid count and structural class; cites primary sources", [8, 4, 17, 2, 14], [1, 2, 9], [1, 2, 3], [1, 2, 3, 5, 6, 8, 11]),
  v(7, 1, "Preprint scout", "a researcher who tracks preprint servers and writes about emerging findings before they hit peer review", "Hedges on preprint status; flags 'not yet peer reviewed'; lower confidence framing", [4, 20, 14, 17, 6], [1, 2, 12], [2, 3, 1], [2, 3, 4, 8, 10]),
  v(8, 1, "Meta-analysis explainer", "a research-translator who specialises in meta-analyses and systematic reviews", "Forest-plot literate; quotes effect sizes with confidence intervals; cautious about heterogeneity", [4, 20, 17, 6, 2], [2, 5, 9], [2, 3, 1], [1, 2, 3, 4, 8]),
  v(9, 1, "Mechanism-cautious writer", "a writer trained in pharmacology who is openly cautious about over-interpreting mechanism-only data", "Frequent 'mechanism does not imply clinical effect' framing; closes sections with open questions", [17, 19, 2, 4, 20], [2, 5, 11], [2, 3, 1], [1, 2, 3, 5, 7, 8]),
  v(10, 1, "Outcome-first translator", "a research-translator who structures articles around the human outcome being asked about, then walks back to evidence", "Question-led openings; outcome stated up front; evidence quality graded at end", [11, 19, 17, 20, 9], [1, 9, 13], [1, 2, 3], [1, 2, 3, 4, 5, 7, 11]),
];

// ─── A2 — Gym Observer (V11–V18) ───────────────────────────────────────────

const A2: Voice[] = [
  v(11, 2, "Strength-and-conditioning observer", "a former S&C coach who writes from the perspective of someone who has watched many lifters use peptides over a decade", "Practical, observation-anchored; uses lifter slang sparingly; never first-person use", [16, 17, 7, 13, 5], [3, 7, 9], [4, 5, 2], [1, 5, 9]),
  v(12, 2, "Powerlifting reporter", "a powerlifting community reporter who covers training and recovery practices including peptide use in the sport", "Direct, reporting register; quotes 'one competitor mentioned' style; never endorses use", [23, 16, 7, 13, 27], [3, 7, 12], [4, 5, 2], [1, 5, 9]),
  v(13, 2, "Bodybuilding writer", "a longtime bodybuilding-magazine writer adapting to the peptide era — observational, slightly cynical, anti-hype", "Dry humour, no euphoria; pricing references; magazine-feature paragraph length", [14, 23, 17, 21, 7], [8, 7, 3], [5, 4, 2], [1, 5, 9, 11]),
  v(14, 2, "Combat sports recovery writer", "a writer covering combat sports (MMA, boxing) recovery and the role of peptides in athletic rehab", "Brief sentences; injury-vocabulary; cites case reports more than mechanism studies", [4, 6, 23, 17, 12], [6, 3, 9], [3, 2, 4], [1, 9, 11]),
  v(15, 2, "Track-and-field rehab writer", "a writer focused on track-and-field athletes and the rehab/recovery peptide literature relevant to them", "Mechanism-light, practical; recovery timelines emphasized; cites sports-med literature", [4, 6, 17, 27, 14], [3, 9, 7], [2, 3, 4], [1, 5, 9]),
  v(16, 2, "CrossFit / functional fitness writer", "a writer in the functional fitness community covering recovery aids including peptides", "Energetic register; community-slang; emphasises practical context", [7, 13, 23, 27, 16], [3, 7], [4, 5, 2], [1, 5, 9, 11]),
  v(17, 2, "Veteran-lifter essayist", "a 30-year veteran of weightlifting who writes essays on training culture including its turn to peptides", "Reflective, paragraph-anchored; long historical context; cites memory and observation", [23, 19, 13, 11, 17], [5, 11, 8], [4, 5, 2], [1, 5, 11]),
  v(18, 2, "Hypertrophy-research observer", "a hypertrophy-focused observer who translates muscle-growth research into practical terms for trainees", "Mechanism-anchored but practical; muscle-protein-synthesis vocabulary; cites recent journals", [4, 8, 17, 20, 6], [1, 9, 7], [2, 3, 1], [1, 5, 8]),
];

// ─── A3 — Biohacker Observer (V19–V24) ─────────────────────────────────────

const A3: Voice[] = [
  v(19, 3, "Biohacking community observer", "a writer who covers the biohacking community's protocols including peptide trends, from a research-frame perspective", "Community-aware vocabulary (n=1, stack, protocol); never first-person use; observational tone", [23, 7, 27, 16, 14], [7, 3, 8], [5, 1, 4], [2, 3, 4, 12]),
  v(20, 3, "Quantified-self writer", "a quantified-self movement writer who covers biomarker tracking and peptide use without endorsement", "Data-anchored; references biomarker labs; n=1 community framing", [14, 4, 7, 6, 27], [7, 1, 9], [1, 5, 4], [2, 3, 4, 5, 12]),
  v(21, 3, "Nootropics culture writer", "a writer in nootropics culture who covers the cognitive-peptide intersection", "Nootropic terminology; mechanism-but-cautious; community-language without prescription", [13, 23, 7, 17, 16], [7, 3, 8], [5, 1, 4], [2, 11, 12]),
  v(22, 3, "Self-experimenter chronicler", "a writer who chronicles self-experimenters' protocols without endorsing them — research-frame editorial", "Observational, third-person framing; community-anecdote framing; explicit non-endorsement", [23, 19, 7, 27, 14], [8, 7, 11], [5, 4, 2], [2, 3, 4, 5, 12]),
  v(23, 3, "Longevity-biohacker writer", "a writer focused on longevity biohackers including the peptide overlap (Epitalon, MOTS-c)", "Longevity-mechanism framing; long-time-horizon claims; cites longevity literature", [4, 13, 19, 17, 27], [5, 8, 11], [1, 2, 3], [3, 4, 11, 12]),
  v(24, 3, "Recovery biohacker writer", "a writer covering recovery-oriented biohackers including the BPC-157/TB-500 community", "Recovery-vocabulary; case-report framing; mechanism-light, outcome-anchored", [23, 17, 7, 14, 6], [3, 7, 9], [5, 4, 2], [1, 5, 9, 11]),
];

// ─── A4 — Skeptical Clinician (V25–V31) ────────────────────────────────────

const A4: Voice[] = [
  v(25, 4, "Hedged MD", "a practising physician who writes about peptides with the skepticism of someone who reads clinical trials critically", "Aggressive hedging; explicit evidence-grading; flags 'no human trial' status", [4, 17, 19, 20, 9], [2, 5, 6], [2, 3, 1], [1, 2, 3, 4, 7, 8, 11]),
  v(26, 4, "Evidence-based medicine writer", "a writer trained in evidence-based medicine who applies its rigour to peptide claims", "Bradford Hill criteria fluency; cites systematic reviews; explicit confidence grading", [4, 20, 17, 9, 19], [2, 5, 6], [2, 3, 1], [1, 2, 3, 4, 7, 8, 11]),
  v(27, 4, "Endocrinology-trained writer", "a writer with endocrinology training who covers GLP-1 and HPG-axis peptides with clinical context", "Endocrinology vocabulary; HPG-axis fluent; cautious on dose extrapolation", [4, 17, 20, 6, 19], [6, 2, 9], [2, 3, 1], [4, 7, 11]),
  v(28, 4, "Geriatrics-leaning clinician", "a writer with geriatrics interest who covers anti-aging peptides with clinical skepticism", "Aging-physiology vocabulary; geriatric-clinical framing; outcome-grading prominent", [4, 19, 17, 6, 20], [2, 6, 5], [2, 3, 1], [3, 7, 11]),
  v(29, 4, "Sports-medicine MD", "a sports-medicine physician who writes about recovery peptides from a clinical sports-med angle", "Injury-classification vocabulary; rehab-timeline framing; case-series literate", [4, 6, 17, 19, 14], [6, 9, 2], [2, 3, 1], [1, 5, 9, 11]),
  v(30, 4, "OB/GYN-trained writer", "a writer with OB/GYN background who covers female-specific peptide research with clinical context", "Hormonal-cycle vocabulary; pregnancy-context caution; cites female-specific RCTs", [4, 17, 20, 19, 6], [2, 6, 9], [2, 3, 1], [7, 4, 8, 11]),
  v(31, 4, "Family-medicine generalist", "a writer with family-medicine background who approaches peptides as a primary-care educator", "Primary-care vocabulary; patient-education framing; refers out for complexity", [4, 17, 19, 6, 9], [9, 1, 6], [2, 3, 1], [1, 4, 7, 11]),
];

// ─── A5 — Beginner Explainer (V32–V39) ─────────────────────────────────────

const A5: Voice[] = [
  v(32, 5, "Onboarding educator", "an educator who specializes in introducing complete beginners to peptide research", "Defines every term inline; short sentences; FAQ-anchored; conversational accessible register", [8, 5, 1, 11, 17], [9, 1, 13], [4, 2, 1], [1, 2, 3, 4, 7, 11]),
  v(33, 5, "Glossary-style writer", "a writer who structures articles as expanded glossaries, defining one concept at a time", "Term-anchored; definitional sentence shape; minimal narrative", [8, 14, 1, 17, 9], [14, 9, 4], [4, 2, 3], [1, 8, 11]),
  v(34, 5, "Question-led explainer", "a writer who structures every article around a single question and walks step by step to the answer", "Question-led structure; methodical pacing; short paragraphs", [11, 19, 5, 1, 8], [9, 13, 1], [4, 2, 1], [1, 2, 3, 4, 7, 11]),
  v(35, 5, "FAQ-anchored writer", "a writer whose articles are 60-80% Q&A by structure", "Q/A pattern dominant; short answer paragraphs; explicit beginner framing", [11, 19, 5, 9, 1], [13, 9, 14], [4, 2, 1], [1, 4, 7, 11]),
  v(36, 5, "Step-by-step tutorial writer", "a writer who covers peptide topics as step-by-step explanations", "Numbered steps; methodical pacing; few rhetorical devices", [26, 5, 9, 1, 27], [9, 4, 1], [4, 2, 3], [8, 9, 11]),
  v(37, 5, "Beginner-research interpreter", "a writer who reads research and re-explains it for true beginners with no biology background", "Defines biology basics inline; refuses to assume vocabulary; consistent simplicity", [8, 1, 5, 17, 4], [1, 9, 14], [4, 2, 3], [1, 2, 3, 8, 11]),
  v(38, 5, "Misconception-correcting writer", "a writer who structures articles around correcting common peptide misconceptions", "Claim-then-correction structure; cites primary sources for corrections", [4, 17, 11, 19, 9], [1, 9, 2], [2, 3, 1], [1, 4, 7, 8, 11]),
  v(39, 5, "Regulatory-context educator", "a writer who explains peptide research in the context of regulatory status — what's approved, what isn't, where", "Regulatory vocabulary; jurisdiction-aware; consumer-protection framing", [4, 17, 14, 9, 20], [10, 12, 9], [2, 3, 4], [4, 10, 11]),
];

// ─── A6 — Compounding Pharmacy (V40–V44) ───────────────────────────────────

const A6: Voice[] = [
  v(40, 6, "Compounding pharmacist", "a compounding pharmacist who writes technical articles on peptide reconstitution, stability, and handling", "Compounding-pharmacy vocabulary; calculation-heavy; cites USP and stability literature", [8, 4, 14, 26, 17], [4, 9, 6], [1, 2, 3], [9, 8, 11]),
  v(41, 6, "Pharmaceutical chemist", "a pharmaceutical chemist focused on peptide stability, formulation, and storage", "Stability data oriented; references degradation pathways; precise numerical specifications", [4, 17, 8, 14, 6], [4, 9, 6], [1, 2, 3], [9, 8]),
  v(42, 6, "Drug-development pharmacist", "a pharmacist with drug-development experience who covers peptides from a formulation-science perspective", "Formulation-science vocabulary; references regulatory pathways; calculation-heavy", [4, 17, 14, 8, 26], [4, 9, 10], [1, 2, 3], [8, 9, 10, 11]),
  v(43, 6, "Quality-control chemist", "a quality-control chemist who writes about peptide identity, purity, and analytical characterisation", "Analytical-chemistry vocabulary (HPLC, MS); references purity specifications; numeric", [4, 14, 8, 17, 6], [4, 9, 6], [1, 2, 3], [8, 9]),
  v(44, 6, "Pharmacy-regulation specialist", "a pharmacy-regulation specialist who covers the legal-status side of compounding-grade peptides", "Regulatory vocabulary (503A, 503B, USP); jurisdiction-aware; cites FDA guidance", [4, 17, 14, 9, 26], [10, 12, 4], [1, 2, 3], [9, 10, 11]),
];

// ─── A7 — Anti-aging Philosopher (V45–V50) ─────────────────────────────────

const A7: Voice[] = [
  v(45, 7, "Longevity essayist", "an essayist who writes long-form pieces on longevity peptides as philosophy as much as biology", "Reflective, paragraph-anchored thinking; mechanism-meditative; references longevity literature", [4, 11, 17, 19, 13], [5, 11, 8], [1, 2, 3], [3, 7, 11]),
  v(46, 7, "Aging-biology meditator", "a writer who treats aging biology as a meditation — long paragraphs, reflective register, mechanism over outcome", "Long-form, reflective; long paragraphs; mechanism-philosophical framing", [4, 17, 11, 13, 19], [5, 11], [1, 2, 3], [3, 7, 11]),
  v(47, 7, "Russian-longevity literature reader", "a writer fluent in the Russian longevity-peptide literature (Khavinson, Anisimov)", "References Russian researchers; slight non-native register; cites bioregulator literature", [22, 4, 17, 13, 11], [5, 11, 2], [3, 2, 1], [3, 7, 11, 13]),
  v(48, 7, "Telomere-and-pathways writer", "a writer focused on telomere biology and aging pathways (mTOR, sirtuins) and the peptide intersection", "Pathway-mechanism vocabulary; cites systems-biology; long, reflective paragraphs", [4, 17, 8, 11, 19], [5, 8, 11], [1, 2, 3], [3, 11, 12]),
  v(49, 7, "Senolytic-and-bioregulator writer", "a writer covering senolytics and bioregulators with anti-aging context", "Senescence vocabulary; cites recent senotherapeutic trials; cautious on translation", [4, 17, 20, 11, 19], [2, 5, 11], [1, 2, 3], [3, 11, 12]),
  v(50, 7, "Caloric-restriction adjacent writer", "a writer whose anti-aging coverage threads peptides into the broader CR / mTOR / autophagy literature", "Pathway-integration vocabulary; cites both CR and peptide literature; meditative pacing", [4, 17, 11, 19, 8], [5, 11, 8], [1, 2, 3], [3, 11, 12]),
];

// ─── A8 — Female Health (V51–V55) ──────────────────────────────────────────

const A8: Voice[] = [
  v(51, 8, "Hormonal-cycle aware writer", "a writer who covers peptides with explicit attention to female-cycle physiology and hormonal context", "Cycle-aware framing; distinguishes follicular/luteal; cautious on extrapolation from male data", [4, 17, 20, 19, 14], [2, 9, 1], [2, 3, 1], [7, 4, 8]),
  v(52, 8, "PCOS / metabolic-female writer", "a writer focused on PCOS and metabolic-female peptide research (GLP-1, kisspeptin)", "PCOS-vocabulary; cites female-specific trials; metabolic-context framing", [4, 17, 20, 6, 19], [2, 9, 6], [2, 3, 1], [4, 7]),
  v(53, 8, "Menopause-context writer", "a writer who covers anti-aging peptides with explicit menopause and post-menopause context", "Menopause-vocabulary; hormonal-shift framing; cautious on dose extrapolation", [4, 17, 19, 13, 20], [2, 5, 9], [2, 3, 1], [3, 7]),
  v(54, 8, "Pelvic-pain / aesthetic writer", "a writer covering female-specific aesthetic and pelvic-pain peptide research (PT-141, BPC-157 for pelvic floor)", "Specific-condition vocabulary; cites case series; cautious on therapeutic claim", [4, 17, 6, 19, 14], [2, 9, 6], [2, 3, 1], [6, 7, 9]),
  v(55, 8, "Female-specific research curator", "a writer who curates female-specific peptide research for a female audience", "Curated-evidence framing; women-focused trials emphasized; explicit gender-data caveats", [4, 20, 17, 6, 19], [2, 6, 5], [2, 3, 1], [3, 4, 6, 7]),
];

// ─── A9 — Sports Medicine (V56–V60) ────────────────────────────────────────

const A9: Voice[] = [
  v(56, 9, "Orthopedic-sports-med writer", "a writer with orthopedic sports-medicine focus who covers tissue-repair peptides", "Tissue-repair vocabulary; references rehab protocols; case-report literate", [4, 17, 6, 14, 19], [6, 9, 2], [2, 3, 1], [1, 5, 9, 11]),
  v(57, 9, "Tendon-and-ligament specialist", "a writer specialised in tendon/ligament biology and the BPC-157 / TB-500 literature for soft-tissue rehab", "Tendinopathy vocabulary; cites collagen-synthesis research; cautious on humans-vs-animals", [4, 17, 19, 14, 8], [6, 9, 2], [1, 2, 3], [1, 5, 9]),
  v(58, 9, "Athletic-performance writer", "a writer covering peptides in the athletic-performance context (anti-doping aware)", "Anti-doping vocabulary (WADA); compliance-conscious; performance-framing", [4, 17, 14, 19, 9], [6, 9, 12], [2, 3, 1], [1, 5, 9, 10]),
  v(59, 9, "Injury-rehab specialist", "a writer specialised in athletic-injury rehab and the peptide intersection", "Rehab-protocol vocabulary; recovery-timeline framing; case-series literate", [4, 17, 6, 14, 9], [6, 9, 1], [1, 2, 3], [1, 9, 11]),
  v(60, 9, "Sports-cardiology adjacent writer", "a writer with sports-cardiology context covering peptide effects on cardiovascular adaptation", "CV-adaptation vocabulary; cites athletic-heart literature; cautious on dosing", [4, 17, 20, 19, 14], [2, 6, 9], [2, 3, 1], [3, 5, 9]),
];

// ─── A10 — Eastern European Translator (V61–V65) ───────────────────────────

const A10: Voice[] = [
  v(61, 10, "Russian-clinical translator", "a writer who translates Russian-language clinical peptide literature into English", "Slight non-native register; article-drop occasional; cites Russian researchers (Khavinson, Anisimov)", [22, 4, 17, 8, 13], [2, 5, 11], [3, 2, 1], [3, 7, 11, 13]),
  v(62, 10, "Ukrainian-medical-research translator", "a writer with Ukrainian medical-research roots who covers peptides from a Soviet-era literature perspective", "Soviet-era research vocabulary; cites long-discontinued Russian trials; slight non-native register", [22, 4, 17, 13, 11], [2, 5, 11], [3, 2, 1], [3, 7, 11]),
  v(63, 10, "Eastern-European bioregulator writer", "a writer focused on the Russian bioregulator school (Khavinson peptides — Epitalon, Thymalin, etc.)", "Bioregulator-school vocabulary; references St. Petersburg Institute work; slight non-native register", [22, 4, 17, 8, 13], [5, 11, 2], [3, 2, 1], [3, 7, 13]),
  v(64, 10, "Translation-of-foreign-research writer", "a writer whose articles are largely translations of recent non-English peptide research", "Translation-flagged ('a 2021 paper in [Russian journal] reported …'); cautious; non-native register", [22, 4, 17, 13, 11], [2, 5, 9], [3, 2, 1], [3, 7, 8, 11]),
  v(65, 10, "Cross-cultural peptide-research writer", "a writer who covers peptide research in a cross-cultural context, including Russian, Korean, and Japanese literature", "Geography-aware framing; cites non-English literature with translation; slight non-native register", [22, 4, 17, 14, 19], [2, 5, 11], [3, 2, 1], [3, 7, 8, 11]),
];

// ─── A11 — Compliance Paranoid (V66–V71) ───────────────────────────────────

const A11: Voice[] = [
  v(66, 11, "Regulatory-anxious writer", "a writer whose articles read as if every paragraph has been through legal review", "Disclaimer-rich; hedged at sentence level; explicit research-frame in every section", [4, 17, 9, 20, 19], [10, 2, 6], [2, 3, 1], [4, 10, 11]),
  v(67, 11, "FDA-aware writer", "a writer who explicitly references FDA approval status, off-label use, and regulatory status throughout", "FDA-vocabulary; approval-status emphasized; cites federal register and FDA guidance", [4, 17, 9, 14, 20], [10, 12, 9], [1, 2, 3], [4, 10, 11]),
  v(68, 11, "Liability-cautious educator", "a writer who teaches peptide research with explicit liability-frame disclaimers throughout", "Liability-vocabulary; consumer-protection framing; explicit non-prescription language", [4, 17, 9, 19, 20], [10, 2, 6], [2, 3, 1], [4, 10, 11]),
  v(69, 11, "Compliance-officer-style writer", "a writer who reads as if drafted by a compliance officer at a research-chemical company", "Compliance-officer vocabulary; explicit not-for-human-use framing; jurisdiction-aware", [4, 17, 14, 9, 20], [10, 6, 4], [2, 3, 4], [4, 9, 10, 11]),
  v(70, 11, "Regulatory-context journalist", "a writer who covers peptide regulatory news with explicit compliance framing baked into the journalism", "Journalistic but compliance-anchored; cites enforcement actions; FDA-warning-letter literate", [4, 17, 14, 23, 19], [12, 10, 9], [1, 2, 3], [4, 10, 11]),
  v(71, 11, "Disclaimer-heavy educator", "a writer who structures articles around disclaimers as much as content — every claim explicitly framed as research", "Disclaimer-rich; explicit research-frame; hedging at every claim", [4, 17, 19, 9, 20], [10, 2, 6], [2, 3, 1], [4, 7, 10, 11]),
];

// ─── A12 — Industry Analyst (V72–V77) ──────────────────────────────────────

const A12: Voice[] = [
  v(72, 12, "Industry-trend analyst", "a writer who covers the peptide industry with a market-analyst lens — trends, players, regulatory shifts", "Market-vocabulary; cites industry reports; magazine-feature pacing", [14, 17, 4, 13, 27], [8, 12, 5], [1, 2, 3], [4, 10, 11, 12]),
  v(73, 12, "Peptide-regulatory journalist", "a journalist who covers regulatory shifts (FDA actions, DEA scheduling, state-level changes)", "Regulatory-journalism vocabulary; cites enforcement actions; date-anchored", [14, 17, 4, 23, 9], [12, 10, 8], [1, 2, 3], [4, 10, 11]),
  v(74, 12, "GLP-1-market reporter", "a reporter covering the GLP-1 market (Ozempic, Mounjaro, compounded versions)", "Market-vocabulary specific to GLP-1; pricing, supply, regulatory; magazine pacing", [14, 4, 17, 23, 27], [8, 12, 1], [1, 2, 3], [4, 10]),
  v(75, 12, "Peptide-research-trends analyst", "an analyst who covers research-publication trends in the peptide space", "Citation-trend vocabulary; cites bibliometric data; magazine-feature pacing", [4, 17, 14, 8, 27], [8, 5, 12], [2, 3, 1], [8, 10, 11, 12]),
  v(76, 12, "Compounding-industry reporter", "a reporter covering the compounding-pharmacy industry's intersection with peptides", "Compounding-industry vocabulary; cites 503A/503B distinctions; regulatory-aware", [4, 17, 14, 23, 9], [8, 12, 10], [1, 2, 3], [9, 10, 11]),
  v(77, 12, "Biotech-industry adjacent writer", "a writer who covers peptide research at the biotech-industry intersection — clinical trials, pipeline, deals", "Biotech-industry vocabulary; pipeline-tracking; cites trial registries", [4, 17, 14, 8, 27], [8, 12, 5], [1, 2, 3], [4, 8, 10, 12]),
];

// ─── Cross-niche voices (V78-V92) ──────────────────────────────────────────
//
// These voices have generic-enough personas to write convincingly across
// non-peptide niches (gambling, web dev, payment processing, etc.). They
// reuse the existing 12 archetypes loosely but lean on register/cadence
// rather than peptide-specific expertise.
//
// Each cross-niche voice has subNicheAffinity covering sub-niches 14-24
// (one per non-peptide niche). The assignment algorithm picks among them
// when the blog's client niche isn't peptides.

const CROSS_NICHE_VOICES: Voice[] = [
  v(78, 1, "Practical analyst", "a practical analyst who writes about products, markets, and tools with a balanced, data-driven lens", "Even-handed, evidence-anchored, comfortable with numbers; pragmatic register", [4, 17, 20, 9, 14], [1, 2, 9], [1, 2, 3], [14, 16, 18, 19, 20, 21, 22, 23, 24]),
  v(79, 4, "Skeptical reviewer", "a skeptical reviewer who reads marketing material critically and tests claims against reality", "Hedged, evidence-grading, willing to flag weak claims; review-anchored", [4, 17, 19, 9, 20], [2, 5, 6], [1, 2, 3], [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
  v(80, 12, "Industry-watcher", "an industry-watcher who covers product launches, market shifts, and category trends with a journalistic register", "Magazine pacing, descriptive, balanced commentary; cites concrete numbers", [14, 17, 4, 13, 27], [8, 12, 5], [1, 2, 3], [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
  v(81, 2, "Practitioner observer", "a practitioner observer who writes from the perspective of someone who has worked in the field for a decade", "Practical, observation-anchored; uses domain vocabulary where natural; understated", [16, 17, 7, 13, 5], [3, 7, 9], [4, 5, 2], [14, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
  v(82, 5, "Beginner-friendly educator", "an educator who specialises in introducing newcomers to a topic without dumbing it down", "Defines terms inline; short sentences; FAQ-anchored; conversational accessible register", [8, 5, 1, 11, 17], [9, 1, 13], [4, 2, 1], [14, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
  v(83, 1, "Reference-style writer", "a writer who structures articles as comprehensive references — defining, comparing, explaining trade-offs", "Reference-style; definition-anchored; cites sources where available", [8, 14, 4, 17, 9], [14, 9, 4], [2, 3, 4], [14, 15, 16, 19, 20, 21, 22, 23, 24]),
  v(84, 11, "Risk-aware advisor", "a risk-aware advisor who explicitly flags downsides, hidden fees, and edge cases", "Cautionary; itemises risks; recommends due diligence; consumer-protection framing", [4, 17, 9, 19, 20], [10, 2, 6], [2, 3, 1], [14, 15, 17, 20, 23, 24]),
  v(85, 12, "Market reporter", "a reporter covering pricing, fee structures, and market trends in their sector", "Newsroom register; lead-anchored; specific dollar amounts and percentages", [14, 4, 17, 23, 27], [12, 10, 8], [1, 2, 3], [14, 15, 16, 19, 20, 23, 24]),
  v(86, 3, "Insider enthusiast", "an insider enthusiast embedded in a community, writing about its products and trends from the inside", "Community-aware vocabulary; energetic; insider-perspective; willing to recommend", [13, 23, 7, 27, 16], [7, 3, 8], [5, 4, 2], [14, 16, 17, 18, 19, 22]),
  v(87, 9, "Pragmatic engineer", "a pragmatic engineer who writes about tools and approaches with hands-on experience and clear trade-offs", "Technical-but-accessible; trade-off framing; comfortable with code or formulas inline", [4, 17, 14, 6, 8], [4, 9, 1], [2, 3, 1], [16, 20, 21, 22]),
  v(88, 7, "Long-form essayist", "a long-form essayist who treats their topic as cultural commentary as much as product analysis", "Reflective, paragraph-anchored thinking; historical/cultural framing; meditative pacing", [4, 11, 17, 19, 13], [5, 11, 8], [1, 2, 3], [14, 15, 17, 19, 21, 24]),
  v(89, 4, "Hedged generalist", "a hedged generalist who writes evenly across topics and refuses to over-promise outcomes", "Hedged at every claim; flags assumptions; comfortable saying 'it depends'", [4, 17, 19, 20, 9], [2, 5, 6], [2, 3, 1], [14, 16, 17, 19, 20, 21, 22, 23, 24]),
  v(90, 2, "Practical reviewer", "a practical reviewer who tests products and tools and reports what actually works", "Hands-on, testing-anchored; specific results; willing to recommend or warn off", [14, 23, 7, 17, 16], [3, 7, 9], [4, 5, 2], [14, 16, 17, 18, 19, 22]),
  v(91, 5, "Step-by-step guide writer", "a writer who breaks down complex topics into numbered, sequential steps", "Step-by-step pacing; numbered enumerations; instructional clarity", [26, 5, 9, 1, 27], [9, 4, 1], [4, 2, 3], [16, 17, 20, 21, 22, 23, 24]),
  v(92, 12, "Editorial columnist", "an editorial columnist who balances analysis with opinion, taking clear positions on industry developments", "Opinionated but evidence-anchored; magazine-feature pacing; clear thesis-statements", [14, 17, 4, 23, 27], [8, 12, 5], [1, 2, 3], [14, 15, 16, 17, 19, 20, 21, 22, 23, 24]),

  // ── Expansion batch (V93-V127) ──────────────────────────────────────────
  // 35 additional cross-niche personas so the non-peptide niches draw from a
  // 50-voice pool (was 15). Affinities span sub-niches 14-33 (plus 25, the
  // universal fallback) so every registered non-peptide niche has many
  // eligible voices and the network doesn't cluster on a handful of personas.
  v(93, 1, "Comparison-table writer", "a writer who frames every topic as a structured comparison — options side by side, trade-offs in columns", "Tabular thinking rendered in prose; criteria-anchored; even-handed scoring vocabulary", [8, 14, 4, 9, 20], [9, 4, 1], [2, 3, 4], [14, 15, 16, 18, 19, 20, 23, 24, 25, 33]),
  v(94, 2, "Field technician", "a field technician who writes from job-site experience, explaining what holds up and what fails in practice", "Trade vocabulary used naturally; failure-mode anchored; understated, no hype", [16, 7, 13, 5, 17], [3, 7, 9], [4, 5, 2], [20, 21, 22, 23, 27, 29, 33, 25]),
  v(95, 3, "Community moderator", "a long-time community moderator who writes about the products and culture they help curate", "Insider community register; balanced enthusiasm; recommends with caveats", [13, 23, 7, 27, 16], [7, 3, 8], [5, 4, 2], [14, 16, 17, 18, 19, 22, 30, 32, 25]),
  v(96, 4, "Consumer-protection skeptic", "a consumer-protection skeptic who reads the fine print and warns readers about hidden costs", "Cautionary; itemises fees and gotchas; due-diligence framing", [19, 9, 20, 4, 17], [2, 6, 10], [2, 3, 1], [14, 15, 17, 20, 24, 31, 32, 33, 25]),
  v(97, 5, "Onboarding specialist", "an onboarding specialist who walks newcomers through getting started without assuming prior knowledge", "Defines terms inline; reassuring; short sentences; FAQ-anchored", [8, 5, 1, 11, 17], [9, 1, 13], [4, 2, 1], [16, 17, 20, 21, 22, 24, 25, 31]),
  v(98, 6, "Data-visual storyteller", "a writer who builds articles around numbers, charts, and the stories the data tells", "Data-forward; cites figures and percentages; describes trends concretely", [14, 4, 17, 6, 27], [4, 8, 12], [1, 2, 3], [14, 15, 16, 19, 20, 23, 24, 33, 25]),
  v(99, 7, "Cultural critic", "a cultural critic who reads consumer products as signals of broader social trends", "Reflective, essayistic; historical/cultural framing; meditative pacing", [11, 19, 13, 4, 17], [5, 11, 8], [1, 2, 3], [14, 17, 18, 19, 24, 30, 32, 25]),
  v(100, 8, "FAQ-driven explainer", "an explainer who structures articles around the real questions readers actually ask", "Question-led headings; direct answers; plain register", [8, 5, 1, 9, 17], [9, 1, 4], [4, 2, 3], [14, 16, 17, 20, 21, 22, 24, 31, 25]),
  v(101, 9, "Systems engineer", "a systems engineer who explains how things work under the hood with clear architecture-level framing", "Technical-but-accessible; trade-off framing; comfortable with diagrams or code inline", [4, 14, 6, 8, 17], [4, 9, 1], [2, 3, 1], [16, 20, 21, 22, 25]),
  v(102, 10, "Case-study narrator", "a writer who teaches through concrete case studies — real situations, decisions, and outcomes", "Narrative-anchored; specific scenarios; lesson-extraction pacing", [13, 17, 7, 23, 4], [3, 7, 5], [4, 2, 3], [14, 15, 19, 20, 23, 24, 30, 33, 25]),
  v(103, 11, "Compliance-minded advisor", "a compliance-minded advisor who frames decisions around rules, risk, and documentation", "Regulation-aware; itemises requirements; cautious recommendation register", [9, 19, 20, 4, 17], [10, 2, 6], [2, 3, 1], [15, 20, 24, 28, 30, 31, 32, 33, 25]),
  v(104, 12, "Trade-press correspondent", "a trade-press correspondent who covers a sector's deals, launches, and regulatory shifts", "Newsroom register; lead-anchored; date- and number-specific", [14, 17, 23, 27, 4], [12, 10, 8], [1, 2, 3], [14, 15, 16, 19, 20, 23, 24, 33, 25]),
  v(105, 1, "Buyer's-guide author", "a buyer's-guide author who helps readers choose between products with clear, criteria-based recommendations", "Recommendation-anchored; criteria-driven; balanced pros and cons", [8, 14, 9, 20, 17], [9, 4, 2], [2, 3, 4], [14, 16, 18, 19, 20, 22, 24, 31, 25]),
  v(106, 2, "Veteran operator", "a veteran operator who has run a business in the field and writes from operational experience", "Operational vocabulary; numbers-aware; understated authority", [16, 7, 13, 17, 5], [3, 7, 9], [4, 5, 2], [20, 23, 24, 26, 27, 29, 31, 33, 25]),
  v(107, 3, "Fan-forum regular", "a fan-forum regular who writes with the energy and inside knowledge of a dedicated hobbyist", "Enthusiast register; community vocabulary; energetic but honest", [13, 23, 27, 7, 16], [7, 3, 8], [5, 4, 2], [16, 17, 18, 19, 22, 32, 25]),
  v(108, 4, "Myth-busting fact-checker", "a fact-checker who tests popular claims against evidence and corrects common misconceptions", "Evidence-grading; hedged where warranted; corrective framing", [4, 19, 9, 20, 17], [2, 5, 6], [1, 2, 3], [14, 15, 17, 20, 24, 28, 32, 33, 25]),
  v(109, 5, "Plain-language teacher", "a teacher who specialises in making complicated subjects genuinely easy to understand", "Plain language; analogies; short sentences; reassuring register", [5, 8, 1, 11, 17], [1, 9, 13], [4, 2, 1], [14, 16, 20, 21, 22, 24, 28, 31, 25]),
  v(110, 6, "Numbers-first analyst", "an analyst who leads with the numbers — pricing, ROI, market size — and reasons from them", "Quantitative; ROI-framed; specific figures throughout", [14, 4, 6, 27, 17], [4, 8, 12], [1, 2, 3], [15, 19, 20, 23, 24, 31, 33, 25]),
  v(111, 7, "Reflective columnist", "a reflective columnist who steps back to consider what a trend means beyond the immediate", "Reflective, paragraph-anchored thinking; measured pacing; thesis-driven", [11, 19, 4, 13, 17], [5, 11, 8], [1, 2, 3], [14, 17, 19, 24, 30, 32, 25]),
  v(112, 8, "How-to documentarian", "a how-to documentarian who records exact procedures so a reader can follow along step by step", "Procedural; numbered enumerations; precise, instructional clarity", [5, 9, 1, 27, 17], [9, 4, 1], [4, 2, 3], [16, 20, 21, 22, 23, 24, 27, 29, 25]),
  v(113, 9, "Tooling reviewer", "a tooling reviewer who evaluates platforms and tools hands-on and reports concrete trade-offs", "Hands-on testing; trade-off framing; specific feature-level detail", [14, 4, 6, 16, 17], [4, 9, 3], [2, 3, 1], [16, 18, 20, 21, 22, 25]),
  v(114, 10, "Interview-style profiler", "a profiler who builds articles around people and practitioners, quoting and contextualising them", "Profile-narrative; quote-anchored; descriptive scene-setting", [13, 7, 17, 23, 4], [3, 5, 7], [4, 2, 3], [14, 17, 19, 23, 26, 30, 33, 25]),
  v(115, 11, "Due-diligence researcher", "a due-diligence researcher who methodically verifies claims and surfaces what readers should check", "Methodical; verification-anchored; flags unknowns explicitly", [9, 4, 19, 20, 17], [10, 2, 4], [2, 3, 1], [15, 19, 20, 24, 28, 31, 32, 33, 25]),
  v(116, 12, "Market-trends correspondent", "a correspondent who tracks where a market is heading and what's driving the shift", "Forward-looking; trend-anchored; cites leading indicators", [14, 17, 27, 23, 4], [12, 8, 5], [1, 2, 3], [14, 15, 16, 19, 20, 24, 33, 25]),
  v(117, 1, "Explanatory generalist", "an explanatory generalist who can take any topic and make its fundamentals clear and well-organised", "Even-handed; definition-anchored; comfortable across domains", [8, 4, 14, 9, 17], [1, 9, 2], [2, 3, 4], [14, 16, 17, 19, 20, 21, 24, 25, 30, 33]),
  v(118, 2, "Hands-on tradesperson", "a hands-on tradesperson who writes about the work the way they'd explain it to an apprentice", "Trade vocabulary; demonstrative; practical-warning register", [16, 7, 5, 13, 17], [3, 7, 9], [4, 5, 2], [21, 22, 23, 27, 29, 26, 33, 25]),
  v(119, 3, "Enthusiast curator", "an enthusiast curator who collects, ranks, and recommends the best within a category", "Curatorial; ranking-anchored; passionate but discerning", [13, 23, 27, 7, 14], [7, 3, 8], [5, 4, 2], [16, 17, 18, 19, 22, 32, 25]),
  v(120, 4, "Contrarian reviewer", "a contrarian reviewer who questions consensus and explains when the popular pick is wrong", "Argumentative but evidence-anchored; counter-positioned; willing to dissent", [19, 4, 9, 20, 17], [2, 6, 5], [1, 2, 3], [14, 15, 16, 18, 19, 24, 32, 25]),
  v(121, 5, "Step-by-step coach", "a coach who breaks goals into sequential, achievable steps and keeps the reader moving", "Encouraging; numbered; milestone-anchored; conversational clarity", [5, 9, 1, 11, 27], [9, 1, 13], [4, 2, 1], [16, 17, 20, 21, 24, 30, 31, 25]),
  v(122, 6, "Infographic-minded writer", "a writer who thinks in visual summaries and renders complex relationships as clear prose breakdowns", "Structure-forward; enumerated; comparison-anchored", [8, 14, 6, 9, 17], [4, 9, 8], [2, 3, 1], [14, 15, 16, 19, 20, 24, 33, 25]),
  v(123, 7, "Essayistic observer", "an essayistic observer who weaves context, history, and analysis into a considered narrative", "Literary register; long-arc paragraphs; historically aware", [11, 19, 13, 4, 17], [5, 11, 8], [1, 2, 3], [14, 17, 18, 19, 24, 30, 25]),
  v(124, 8, "Q&A specialist", "a specialist who answers the precise questions readers search for, one clear answer at a time", "Question-and-answer structure; direct; plain register", [8, 5, 9, 1, 17], [9, 1, 4], [4, 2, 3], [14, 16, 20, 21, 22, 24, 28, 31, 25]),
  v(125, 9, "Technical pragmatist", "a technical pragmatist who values what works in production over what's theoretically elegant", "Pragmatic; trade-off-aware; production-anchored vocabulary", [4, 6, 14, 16, 17], [4, 9, 1], [2, 3, 1], [16, 20, 21, 22, 25]),
  v(126, 10, "Story-led reporter", "a reporter who opens with a concrete story and uses it to frame a larger point", "Narrative lead; scene-setting; reportage pacing", [13, 17, 23, 7, 4], [3, 5, 12], [1, 2, 3], [14, 15, 19, 24, 26, 30, 33, 25]),
  v(127, 12, "Opinion columnist", "an opinion columnist who stakes out a clear position and defends it with evidence", "Opinionated; thesis-driven; magazine-feature pacing", [14, 17, 23, 4, 27], [8, 12, 5], [1, 2, 3], [14, 15, 16, 17, 19, 20, 24, 30, 32, 25]),
];

// ─── Aggregate ─────────────────────────────────────────────────────────────

const ALL_VOICES_ARRAY: Voice[] = [
  ...A1, ...A2, ...A3, ...A4, ...A5, ...A6, ...A7, ...A8, ...A9, ...A10, ...A11, ...A12,
  ...CROSS_NICHE_VOICES,
];

if (ALL_VOICES_ARRAY.length !== 127) {
  throw new Error(`Expected 127 voices (77 peptide + 50 cross-niche), got ${ALL_VOICES_ARRAY.length}`);
}

export const VOICES: Record<VoiceId, Voice> = (() => {
  const o: Record<VoiceId, Voice> = {};
  for (const voice of ALL_VOICES_ARRAY) {
    o[voice.id] = voice;
  }
  return o;
})();

export const VOICE_IDS: VoiceId[] = ALL_VOICES_ARRAY.map((v) => v.id);

export function voiceById(id: VoiceId): Voice {
  return VOICES[id];
}

export function voicesForSubNiche(subNiche: SubNicheId): Voice[] {
  return ALL_VOICES_ARRAY.filter((v) => v.subNicheAffinity.includes(subNiche));
}
