import "server-only";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ─── Keys ────────────────────────────────────────────────────────────────────

export const SETTING_KEYS = {
  /** Which provider powers article/content generation. */
  contentModel: "content_model",
  /** Which Claude model powers SEO fixes + reports. */
  fixModel: "fix_model",
} as const;

// ─── Content generation model ────────────────────────────────────────────────

export type ContentModel = "auto" | "deepseek" | "claude";
const CONTENT_MODELS: ContentModel[] = ["auto", "deepseek", "claude"];
export const DEFAULT_CONTENT_MODEL: ContentModel = "auto";

export const CONTENT_MODEL_LABELS: Record<ContentModel, string> = {
  auto: "Auto (DeepSeek → Claude fallback)",
  deepseek: "DeepSeek only",
  claude: "Claude only",
};

// ─── SEO fix / report model (Claude tiers) ───────────────────────────────────

export const FIX_MODEL_OPTIONS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (default, balanced)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast, cheap)" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (highest quality)" },
  { id: "deepseek", label: "DeepSeek v4-pro (avoids Anthropic)" },
] as const;
export const DEFAULT_FIX_MODEL =
  process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

/** True when the fix model setting selects the DeepSeek provider. */
export function isDeepSeekFixModel(model: string): boolean {
  return model === "deepseek";
}

// ─── Cached DB access ────────────────────────────────────────────────────────
// Render runs a long-lived Node process, so a module-level cache persists across
// requests. Short TTL so a Settings change propagates within a few seconds
// without a per-call DB round-trip on the hot generation path.

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { value: string | null; at: number }>();

// now() is wrapped so this module has a single time source; the app runtime has
// Date.now (only the workflow sandbox forbids it).
function now(): number {
  return Date.now();
}

async function readSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value;
  let value: string | null = null;
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    value = row?.value ?? null;
  } catch (err) {
    // Table missing (un-migrated env) or transient error — fall back to
    // defaults so generation never breaks on a settings lookup.
    console.warn(
      `[app-settings] read failed for "${key}":`,
      err instanceof Error ? err.message : err,
    );
    value = null;
  }
  cache.set(key, { value, at: now() });
  return value;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
  cache.set(key, { value, at: now() });
}

// ─── Typed getters ───────────────────────────────────────────────────────────

export async function getContentModel(): Promise<ContentModel> {
  const raw = await readSetting(SETTING_KEYS.contentModel);
  return CONTENT_MODELS.includes(raw as ContentModel)
    ? (raw as ContentModel)
    : DEFAULT_CONTENT_MODEL;
}

export async function getFixModel(): Promise<string> {
  const raw = (await readSetting(SETTING_KEYS.fixModel))?.trim();
  return raw || DEFAULT_FIX_MODEL;
}
