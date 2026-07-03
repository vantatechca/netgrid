/**
 * lib/content/persona-generator.ts
 *
 * LLM-generated per-blog PERSONA (Phase 3). Instead of picking a voice from the
 * fixed 127-entry library, generate a unique voice for a blog from its niche +
 * client + optional operator seed direction. A diversity instruction keeps each
 * generated persona distinct from the others already in the same niche (the
 * anti-footprint goal, minus the rigid library math).
 *
 * The result is stored on the blog's style_profiles row; composeForPost prefers
 * it over the library voice for the {voice.*} prompt slots when present.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedPersona } from "@/lib/content/types";

export type { GeneratedPersona };

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.PERSONA_MODEL || "claude-sonnet-4-6";

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in response");
  return text.slice(start, end + 1);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export interface GeneratePersonaInput {
  /** Human-readable niche/industry label (e.g. "Roofing", "Peptides"). */
  nicheLabel: string;
  clientName?: string;
  /** Optional operator direction, e.g. "sound like a 15-year pitmaster". */
  seedInputs?: string;
  /** Persona descriptions already in use for this niche — to stay distinct. */
  existingPersonas?: string[];
}

/**
 * Generate a distinct writing persona for a blog. Returns null on any failure
 * (caller keeps the library voice). Diversity is instruction-based: the model
 * is shown the personas already in the niche and told to differ clearly.
 */
export async function generateBlogPersona(
  input: GeneratePersonaInput,
): Promise<GeneratedPersona | null> {
  const existing = (input.existingPersonas ?? [])
    .filter(Boolean)
    .slice(0, 20);
  const distinctBlock = existing.length
    ? `\n\nPERSONAS ALREADY USED by other blogs in this niche — your persona MUST be clearly different from ALL of these (different background, temperament, and phrasing; do not reuse their framing):\n${existing
        .map((p, i) => `${i + 1}. ${p}`)
        .join("\n")}`
    : "";
  const seedBlock = input.seedInputs?.trim()
    ? `\n\nOPERATOR DIRECTION (honor this): ${input.seedInputs.trim()}`
    : "";

  const system = `You invent a distinct WRITING PERSONA for a blog in a given niche — the specific human whose voice every article on that blog is written in. The persona should feel like a real, opinionated individual with a background and temperament, not a generic "expert." It writes naturally, avoids AI-tell phrasing, and stays credible for the niche.

Return ONLY valid JSON with exactly these keys:
- "label": 2-4 word handle for this voice (e.g. "Wry ex-contractor").
- "persona": 1-2 sentences describing who is writing (background, temperament, why they're credible).
- "registerSignature": one sentence naming this voice's concrete tics — sentence rhythm, humor, what they emphasize, pet peeves.
- "examplePara1": a 2-4 sentence paragraph written IN this voice about the niche (show, don't tell).
- "examplePara2": a second, differently-angled 2-4 sentence paragraph in the same voice.
- "toneNotes": optional one sentence of extra tone guidance, or "".

No markdown, no preamble — JSON only.`;

  const user = `Niche: ${input.nicheLabel}${
    input.clientName ? `\nClient: ${input.clientName}` : ""
  }${seedBlock}${distinctBlock}

Invent the persona now.`;

  let rawText: string;
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      temperature: 1,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = message.content.find((b) => b.type === "text");
    rawText = block?.text ?? "";
  } catch (err) {
    console.error(
      "[persona] generation failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(rawText)) as Record<string, unknown>;
  } catch (err) {
    console.error(
      "[persona] invalid JSON:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const persona = str(parsed.persona);
  const registerSignature = str(parsed.registerSignature);
  const examplePara1 = str(parsed.examplePara1);
  const examplePara2 = str(parsed.examplePara2);
  // A persona is only useful with a description + at least one example.
  if (!persona || !examplePara1) return null;

  return {
    persona,
    registerSignature: registerSignature || persona,
    examplePara1,
    examplePara2: examplePara2 || examplePara1,
    toneNotes: str(parsed.toneNotes) || undefined,
    label: str(parsed.label) || undefined,
  };
}
