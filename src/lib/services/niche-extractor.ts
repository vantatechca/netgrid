/**
 * lib/services/niche-extractor.ts
 *
 * Turn an uploaded reference document (already converted to Markdown by
 * knowledge-converter) into a DRAFT niche config — the same shape the
 * /content-studio/niches editor edits. This automates the manual "boss sends a
 * file, dev hand-codes the niche rules" workflow: upload → AI drafts → human
 * reviews/edits → save.
 *
 * Mirrors knowledge-extractor's LLM-call + JSON-salvage pattern.
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Same default as the knowledge extractor (a known-good Sonnet snapshot);
// override via env if the network pins a different one.
const MODEL = process.env.NICHE_MODEL || process.env.KNOWLEDGE_MODEL || "claude-sonnet-4-5";
const MAX_INPUT_CHARS = 24000;
const MAX_KEY_TOPICS = 30;
const MAX_DISCLAIMERS = 12;

export interface NicheDraft {
  /** Suggested normalized key (snake_case), e.g. "roofing". */
  suggestedKey: string;
  label: string;
  industry: string;
  defaultAudience: string;
  defaultBrandVoice: string;
  contentStyle: string;
  keyTopics: string[];
  requirements: string;
  disclaimers: string[];
}

function toStringArray(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Extract a draft niche config from a reference doc. Returns best-effort fields
 * (some may be empty if the doc doesn't cover them) for a human to refine.
 */
export async function extractNicheConfig(
  markdown: string,
  opts: { fileName?: string } = {},
): Promise<NicheDraft> {
  const body = markdown.trim();
  if (!body) {
    throw new Error("The uploaded document has no readable text to extract.");
  }

  const truncated =
    body.length > MAX_INPUT_CHARS
      ? `${body.slice(0, MAX_INPUT_CHARS)}\n\n[...truncated for length...]`
      : body;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `You configure a blog-content niche from a client's reference document (brief, style guide, compliance sheet, keyword list, etc.). Read it and produce the niche's generation config.

Return ONLY valid JSON with exactly these keys:
- "suggestedKey": short snake_case identifier for the niche (e.g. "roofing", "tax_lawyer"). Lowercase, words joined by underscores.
- "label": human-readable niche name (e.g. "Roofing & Exterior Contracting").
- "industry": the industry/sector in 1-4 words.
- "defaultAudience": one sentence describing who the articles are written for.
- "defaultBrandVoice": one sentence describing the writing voice/persona.
- "contentStyle": 2-5 sentences of concrete style/approach direction — what to reference, terminology to use, how to be specific (real numbers, named tools/brands, honest trade-offs). This is injected into the article prompt, so make it actionable, not generic.
- "keyTopics": array of up to ${MAX_KEY_TOPICS} concrete topics/terms/entities worth covering (products, names, metrics, terms of art). Prefer terms taken verbatim from the document.
- "requirements": a paragraph of niche-specific writing REQUIREMENTS — must-dos and must-not-dos for this niche (accuracy rules, what to cite, claims to avoid).
- "disclaimers": array of up to ${MAX_DISCLAIMERS} exact compliance/legal disclaimer sentences the content must include (e.g. "This is general information, not legal advice."). Empty array if none apply.

Base everything on the document. Do not invent regulations or facts. No markdown, no preamble — JSON only.`,
    messages: [
      {
        role: "user",
        content: `Document: ${opts.fileName ?? "(untitled)"}\n\n${truncated}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock?.text ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("Niche extraction returned no parseable JSON object.");
    }
    parsed = JSON.parse(raw.slice(start, end + 1));
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  return {
    suggestedKey: str(obj.suggestedKey),
    label: str(obj.label),
    industry: str(obj.industry),
    defaultAudience: str(obj.defaultAudience),
    defaultBrandVoice: str(obj.defaultBrandVoice),
    contentStyle: str(obj.contentStyle),
    keyTopics: toStringArray(obj.keyTopics, MAX_KEY_TOPICS),
    requirements: str(obj.requirements),
    disclaimers: toStringArray(obj.disclaimers, MAX_DISCLAIMERS),
  };
}
