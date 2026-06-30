import Anthropic from "@anthropic-ai/sdk";
import { NICHES } from "@/lib/content/libraries/niches";
import {
  getCachedNicheProfile,
  hasNicheProfile,
  upsertNicheProfile,
  type NicheProfile,
} from "@/lib/content/niche-registry";

// Same provider stack the content generator uses: DeepSeek v4-pro primary,
// Claude Sonnet 4.6 fallback. Configured via env.
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";
const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const CLAUDE_MODEL = "claude-sonnet-4-6";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Normalize a raw niche label to its key (matches normalizeNicheKey's shape). */
function normalizeKey(label: string): string {
  return label.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function humanize(raw: string): string {
  return raw
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

const SYSTEM_PROMPT =
  "You are an expert SEO content strategist. Given a business/blog niche, you " +
  "describe how to write authoritative, specific blog content for it. Return " +
  "ONE valid JSON object only — no prose, no markdown fences.";

function buildUserPrompt(label: string): string {
  return `Niche: "${label}"

Return a JSON object with EXACTLY these fields:
{
  "name": "short display name for the niche",
  "audience": "who reads this niche's blogs (1-2 sentences)",
  "brandVoice": "the writing voice/persona (short phrase)",
  "contentStyle": "how to write it: what specifics to include and what to avoid (1-3 sentences)",
  "requirements": "niche-specific accuracy rules: real terminology, concrete numbers, named brands/tools/standards, and any disclaimers (2-4 sentences)",
  "keyTopics": ["8-12 concrete blog topics/subjects for this niche"],
  "primaryTerms": ["6-8 CORE subject terms a single post focuses on — concrete nouns or named things"],
  "adjacentTerms": ["6-10 topically related subject terms"]
}

Use real, specific vocabulary for this exact niche. Never use placeholders.`;
}

/** Extract the first complete top-level JSON object from a model response. */
function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text.trim();
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  return text.substring(start);
}

async function callDeepSeek(system: string, user: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
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
        max_tokens: 1500,
        temperature: 0.6,
        thinking: { type: "disabled" }, // v4-pro defaults thinking on → empty content
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned no content");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function callClaude(system: string, user: string): Promise<string> {
  const resp = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    temperature: 0.6,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude returned no text");
  return block.text;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

function pickString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function normalizeProfile(
  key: string,
  label: string,
  raw: Record<string, unknown>,
): NicheProfile | null {
  const primaryTerms = toStringArray(raw.primaryTerms);
  const adjacentTerms = toStringArray(raw.adjacentTerms);
  const keyTopics = toStringArray(raw.keyTopics);
  // Need a usable compound pool, else this niche is no better than the
  // universal fallback — bail and let the fallback handle it.
  if (primaryTerms.length < 2) return null;

  return {
    key,
    name: pickString(raw.name, humanize(label)),
    audience: pickString(raw.audience, `readers interested in ${label.toLowerCase()}`),
    brandVoice: pickString(raw.brandVoice, "knowledgeable and helpful, evidence-based"),
    contentStyle: pickString(
      raw.contentStyle,
      "clear and specific; use real names and numbers; avoid generic filler",
    ),
    requirements: pickString(raw.requirements, ""),
    keyTopics,
    primaryTerms,
    adjacentTerms: adjacentTerms.length > 0 ? adjacentTerms : primaryTerms,
  };
}

/**
 * Ensure a niche profile exists for `rawNiche`. No-op when the niche is one of
 * the hardcoded niches or already has a generated profile. Otherwise makes a
 * single LLM call (DeepSeek → Claude fallback), validates the result, and
 * persists it. NON-FATAL: returns null on any failure so the caller's client
 * save still succeeds and the niche falls back to "universal".
 */
export async function ensureNicheProfile(
  rawNiche: string | null | undefined,
): Promise<NicheProfile | null> {
  const label = (rawNiche ?? "").trim();
  if (!label) return null;
  const key = normalizeKey(label);
  if (!key) return null;

  // Hardcoded niche → nothing to generate.
  if (NICHES[key]) return null;

  // Already generated → reuse.
  if (await hasNicheProfile(key)) return getCachedNicheProfile(key) ?? null;

  const user = buildUserPrompt(label);
  let rawText: string;
  try {
    if (process.env.DEEPSEEK_API_KEY) {
      rawText = await callDeepSeek(SYSTEM_PROMPT, user).catch(() =>
        callClaude(SYSTEM_PROMPT, user),
      );
    } else {
      rawText = await callClaude(SYSTEM_PROMPT, user);
    }
  } catch (err) {
    console.error(
      `[niche-profile] generation failed for "${label}":`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>;
  } catch (err) {
    console.error(
      `[niche-profile] invalid JSON for "${label}":`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const profile = normalizeProfile(key, label, parsed);
  if (!profile) {
    console.warn(`[niche-profile] generated profile for "${label}" was unusable`);
    return null;
  }

  try {
    await upsertNicheProfile(profile);
    console.info(`[niche-profile] created profile for niche "${key}"`);
  } catch (err) {
    console.error(
      `[niche-profile] persist failed for "${label}":`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  return profile;
}
