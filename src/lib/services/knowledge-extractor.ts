import Anthropic from "@anthropic-ai/sdk";
import { getContentModel } from "@/lib/settings/app-settings";

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
 *
 * PROVIDER RESILIENCE: extraction is a plain JSON text completion, so it is
 * not tied to Anthropic. It routes through the same DeepSeek/Claude providers
 * the rest of the app uses and, crucially, FALLS BACK to the other provider
 * when the preferred one is unavailable (auth failure, "organization
 * disabled", rate limit, outage, …). That way a spreadsheet of keywords still
 * gets mined when one provider's account is down. Order follows the operator's
 * content-model setting (Settings → AI Models): "claude" tries Claude first,
 * everything else tries DeepSeek first; the other provider is the fallback.
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Match the model the rest of the app actually uses (content-generator's
// CLAUDE_MODEL = "claude-sonnet-4-5"). The previously hardcoded dated snapshot
// isn't provisioned on every account, which silently failed extraction.
// Overridable via env without a code change.
const MODEL = process.env.KNOWLEDGE_MODEL || "claude-sonnet-4-5";

// DeepSeek fallback provider (OpenAI-compatible Chat Completions). Same env
// contract as content-generator / claude-client so one set of keys configures
// every path.
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const DEEPSEEK_TIMEOUT_MS = 120_000;

// Cap the document text fed to the model so a huge upload can't blow up cost
// or the context window. ~24k chars ≈ 6k tokens — plenty for a brief or
// keyword sheet; longer docs are truncated with a marker.
const MAX_INPUT_CHARS = 24_000;

const MAX_KEYWORDS = 40;
const MAX_TOPICS = 20;
const MAX_TOKENS = 1024;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KnowledgeExtraction {
  /** Concrete search terms / phrases worth targeting in posts. */
  keywords: string[];
  /** Higher-level subject areas the document covers. */
  topics: string[];
  /** A 1-2 sentence description of what the document contains. */
  summary: string;
}

type Provider = "claude" | "deepseek";

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

function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function deepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * Preferred provider order. Follows the operator's content-model setting, with
 * the other configured provider always appended as a fallback so extraction
 * survives one provider being down. Providers without a configured key are
 * dropped. Defaults to DeepSeek-first (matching the "auto" content model) on
 * any settings-lookup error.
 */
async function providerOrder(): Promise<Provider[]> {
  let claudeFirst = false;
  try {
    claudeFirst = (await getContentModel()) === "claude";
  } catch {
    claudeFirst = false;
  }
  const ordered: Provider[] = claudeFirst
    ? ["claude", "deepseek"]
    : ["deepseek", "claude"];
  return ordered.filter((p) =>
    p === "claude" ? claudeConfigured() : deepseekConfigured(),
  );
}

/** One Claude JSON completion. Returns the raw model text. */
async function callClaude(system: string, user: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

/**
 * One DeepSeek JSON completion via its OpenAI-compatible Chat Completions
 * endpoint (POST {base}/chat/completions, Bearer auth). Mirrors the request
 * shape used elsewhere in the app: thinking disabled (so `content` is
 * populated) and response_format=json_object.
 */
async function callDeepSeek(system: string, user: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.3,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    const e = err as Error;
    throw new Error(
      e.name === "AbortError"
        ? "DeepSeek request timed out"
        : `DeepSeek network error: ${e.message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek API ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Run the extraction completion against the preferred provider, transparently
 * falling back to the next configured provider on failure. Throws only when
 * every provider is exhausted (or none is configured).
 */
async function completeExtraction(
  system: string,
  user: string,
): Promise<string> {
  const order = await providerOrder();
  if (order.length === 0) {
    throw new Error(
      "No AI provider configured for knowledge extraction — set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY.",
    );
  }

  let lastErr: unknown;
  for (const provider of order) {
    try {
      return provider === "claude"
        ? await callClaude(system, user)
        : await callDeepSeek(system, user);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[knowledge-extractor] ${provider} failed${
          order.indexOf(provider) < order.length - 1
            ? " — falling back to next provider"
            : ""
        }: ${msg.slice(0, 200)}`,
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? "extraction failed"));
}

// ─── Extractor ──────────────────────────────────────────────────────────────

/**
 * Extract keywords, topics, and a summary from a document's Markdown.
 *
 * @param markdown  Normalised Markdown body (from convertToMarkdown).
 * @param opts.fileName  Original file name — helps the model frame the content.
 * @param opts.niche     The client's niche, if known — focuses keyword choice.
 * @throws if every configured provider fails or returns unusable output.
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

  const system = `You extract structured, reusable knowledge from a client's reference document so it can guide blog-post ideation later. ${nicheLine}
Return ONLY valid JSON with exactly these keys:
- "keywords": array of up to ${MAX_KEYWORDS} concrete search terms or phrases worth targeting in articles (specific products, names, metrics, terms of art — not generic filler).
- "topics": array of up to ${MAX_TOPICS} higher-level subject areas the document covers.
- "summary": a 1-2 sentence plain-text description of what this document contains.
Prefer terms taken verbatim from the document. Do not invent facts. No markdown, no preamble, no explanation — JSON only.`;

  const user = `Document: ${opts.fileName ?? "(untitled)"}

${truncated}`;

  const raw = await completeExtraction(system, user);

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
