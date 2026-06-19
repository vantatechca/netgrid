import Anthropic from "@anthropic-ai/sdk";

/**
 * Knowledge-base extraction pass.
 *
 * Given the normalised Markdown of an uploaded client document, distills the
 * reusable signal — keywords, topics, and a short summary — that ideation and
 * generation later consult. This runs ONCE, at upload: the boss's documents
 * are parsed a single time and the distilled result is stored, so every
 * subsequent post reuses it for free rather than re-reading the raw file.
 *
 * Keep it tolerant: extraction is best-effort and must never block an upload.
 * The caller stores the document regardless and records a failure if this
 * throws (see knowledge-actions.ts).
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Matches the model used by the other auxiliary Claude calls in this codebase
// (SEO fixes, reports, ideation). Bump in one place if quality needs it.
const MODEL = "claude-sonnet-4-20250514";

// Cap the document text fed to the model so a huge upload can't blow up cost
// or the context window. ~24k chars ≈ 6k tokens — plenty for a brief or
// keyword sheet; longer docs are truncated with a marker.
const MAX_INPUT_CHARS = 24_000;

const MAX_KEYWORDS = 40;
const MAX_TOPICS = 20;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KnowledgeExtraction {
  /** Concrete search terms / phrases worth targeting in posts. */
  keywords: string[];
  /** Higher-level subject areas the document covers. */
  topics: string[];
  /** A 1-2 sentence description of what the document contains. */
  summary: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

// ─── Extractor ──────────────────────────────────────────────────────────────

/**
 * Extract keywords, topics, and a summary from a document's Markdown.
 *
 * @param markdown  Normalised Markdown body (from convertToMarkdown).
 * @param opts.fileName  Original file name — helps the model frame the content.
 * @param opts.niche     The client's niche, if known — focuses keyword choice.
 * @throws if the model call fails or returns unusable output.
 */
export async function extractKnowledge(
  markdown: string,
  opts: { fileName?: string; niche?: string } = {},
): Promise<KnowledgeExtraction> {
  const body = markdown.trim();
  if (!body) {
    return { keywords: [], topics: [], summary: "" };
  }

  const truncated =
    body.length > MAX_INPUT_CHARS
      ? `${body.slice(0, MAX_INPUT_CHARS)}\n\n[...truncated for length...]`
      : body;

  const nicheLine = opts.niche
    ? `The client operates in the "${opts.niche}" niche — prefer keywords and topics relevant to that space.`
    : "";

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `You extract structured, reusable knowledge from a client's reference document so it can guide blog-post ideation later. ${nicheLine}
Return ONLY valid JSON with exactly these keys:
- "keywords": array of up to ${MAX_KEYWORDS} concrete search terms or phrases worth targeting in articles (specific products, names, metrics, terms of art — not generic filler).
- "topics": array of up to ${MAX_TOPICS} higher-level subject areas the document covers.
- "summary": a 1-2 sentence plain-text description of what this document contains.
Prefer terms taken verbatim from the document. Do not invent facts. No markdown, no preamble, no explanation — JSON only.`,
    messages: [
      {
        role: "user",
        content: `Document: ${opts.fileName ?? "(untitled)"}

${truncated}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock?.text ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Salvage a JSON object embedded in surrounding prose, if any.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("Extraction returned no parseable JSON object.");
    }
    parsed = JSON.parse(raw.slice(start, end + 1));
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  return {
    keywords: toStringArray(obj.keywords, MAX_KEYWORDS),
    topics: toStringArray(obj.topics, MAX_TOPICS),
    summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
  };
}
