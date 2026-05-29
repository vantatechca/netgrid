import { SUB_NICHES } from "@/lib/content/libraries/sub-niches";
import type { SubNicheId } from "@/lib/content/types";

/**
 * Topic-aware hero-image generator — Google Nano Banana exclusively.
 *
 *   Default model: gemini-3-flash-image-preview ("Nano Banana 2")
 *   Override via:  GOOGLE_IMAGE_MODEL env var
 *
 *   Returns base64 image bytes as a data: URI on the post's featuredImageUrl.
 *   The Shopify and WordPress publish paths both decode data: URIs inline
 *   and re-upload bytes to the platform's own media library, so the data
 *   URI only lives in our DB transiently.
 *
 *   FALLBACK (Google-only): if the configured (paid) model is QUOTA-blocked
 *   — e.g. Nano Banana Pro (gemini-3-pro-image) has NO free tier, limit: 0 —
 *   we step down to a free-tier Google image model so the post still ships
 *   with an on-topic image. No third-party providers. If BOTH Google models
 *   fail, the caller ships the post without that image.
 *
 *   Required env:
 *     GOOGLE_API_KEY            — Google AI Studio API key
 *     (optional) GOOGLE_IMAGE_MODEL          — primary (paid) model id
 *     (optional) GOOGLE_IMAGE_FALLBACK_MODEL — free-tier step-down model
 *                                              (default gemini-2.5-flash-image)
 *
 *   Model identifiers (verify exact strings via the clipboard icon in
 *   AI Studio's "Image Generation" panel):
 *     Nano Banana Pro  → gemini-3-pro-image-preview      (paid, state-of-the-art)
 *     Nano Banana 2    → gemini-3-flash-image-preview    (paid, default here)
 *     Nano Banana      → gemini-2.5-flash-image          (free tier)
 *
 *   Routing is automatic by prefix:
 *     gemini-*  → :generateContent endpoint
 *     imagen-*  → :predict endpoint
 */

// ── Constants ──────────────────────────────────────────────────────────────

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GOOGLE_DEFAULT_MODEL = "gemini-3-flash-image-preview";
const GOOGLE_TIMEOUT_MS = 60_000;
// Free-tier Google image model to step down to when the primary (paid)
// model is quota-blocked. Nano Banana *Pro* (gemini-3-pro-image) has NO
// free tier (limit: 0), so a free-tier key must fall back to a flash model
// or it can never produce an image. Override via GOOGLE_IMAGE_FALLBACK_MODEL.
const GOOGLE_FALLBACK_MODEL =
  process.env.GOOGLE_IMAGE_FALLBACK_MODEL || "gemini-2.5-flash-image";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GenerateImageInput {
  title: string;
  keywords?: string[];
  niche?: string | null;
  subNicheId?: SubNicheId;
  primaryCompounds?: string[];
  /**
   * When provided, bypasses the static scene builder and uses this scene
   * directly. Intended for the Claude-summarized scene description that
   * makes each hero image content-aware. We still append the standard
   * photographic-style + anti-stock-photo negatives.
   */
  customScene?: string;
  /**
   * Image role within the post. Defaults to "hero" (wide establishing
   * shot used for the featured image). "body" requests a deliberately
   * different framing of the same topic (detail / close-up / alternative
   * angle) so the in-content image visibly differs from the hero even
   * when both share the same customScene.
   */
  variant?: "hero" | "body";
}

export interface GeneratedImage {
  /** Always a data: URI — decoded inline by the publish path. */
  url: string;
  provider: "google";
  hosting: "data_uri";
  promptUsed: string;
  /** The model identifier that produced the image (for logging). */
  model: string;
}

// ── Visual scenes per sub-niche (peptide blogs) ────────────────────────────
//
// Action-oriented documentary scenes — concrete settings with concrete
// objects, not "wellness flat-lays with pastel bottles." The model tends
// to default to skincare shelf imagery when we lead with abstract mood
// words, so each scene below names a specific environment, props, and
// lighting style the model can actually render.

const SUB_NICHE_VISUALS: Partial<Record<SubNicheId, string>> = {
  1: "interior of a sports medicine rehabilitation clinic with a treatment bench, foam rollers and resistance bands on a padded mat, daylight from large windows, documentary photography",
  2: "shallow depth-of-field shot of an open neuroscience textbook on a wooden desk with a brass reading lamp, anatomical diagrams of synapses visible on the page, warm late-afternoon light",
  3: "wide shot of an older athlete running on a mountain trail at golden hour, silhouette only, dramatic backlight, no facial detail",
  4: "overhead documentary shot of a kitchen counter mid meal-prep with chopped vegetables, a digital kitchen scale, and a chef's knife on a wooden board, natural window light",
  5: "weight room interior with a barbell loaded on the floor, chalk dust visible in a shaft of overhead light, rubber flooring, industrial ceiling, photographed at a low angle",
  6: "macro close-up of human skin texture under raking side light, showing pores and fine surface detail, abstract minimal composition",
  7: "documentary photo of a quiet bedside scene with a leather journal open to a page of handwritten notes and a fountain pen, dawn window light, no people",
  8: "overhead shot of open peer-reviewed journals scattered on a wooden desk with a fountain pen, reading glasses, and a coffee mug, warm window light",
  9: "documentary photo of a working biochemistry lab bench with a pipette mid-use, a centrifuge in the background, lab notebook open on the counter, sharp overhead lighting",
  10: "documentary photo of a newsroom desk with multiple monitors showing scrolling text, an open notepad, late-afternoon light through window blinds",
  11: "overhead shot of a hand-drawn anatomical diagram on grid paper next to a pencil and an open textbook, study lamp lighting, educational setting",
  12: "wide shot of a researcher's workstation showing an open notebook with hand-written protocol notes, a calculator, and a printed scientific paper, side window light",
  13: "wide shot of a quiet bedroom at 2 AM with moonlight through partially-open curtains, an unmade bed in shadow, a single clock on the nightstand, deep blue and grey palette",
};

const FREE_NICHE_VISUALS: Record<string, string> = {
  peptides: "overhead documentary shot of open peer-reviewed journals on a wooden desk with a pen and reading glasses, warm window light",
  reputation_sites: "documentary photo of a computer screen displaying review stars, hands typing on a keyboard, soft window light",
  gambling: "wide shot of a packed sports stadium at night with floodlights, action blur, dramatic composition",
  apps_marketing: "macro photograph of a smartphone screen mid-interaction, finger blur over the touchscreen, soft ambient light",
  exclusive_models: "creator's home office workspace with a ring light, laptop, and a phone on a tripod, late-afternoon light",
  ecom_nails: "macro close-up of nail polish bottles arranged on a marble surface, droplets of polish visible, soft studio light",
  soccer_jersey: "documentary photo of a soccer stadium tunnel with a stadium attendant carrying a folded jersey, golden hour light",
  payment_processing: "close-up of a card payment terminal mid-transaction on a wooden retail counter, hands visible only as silhouette",
  web_dev: "documentary photo of a developer workspace with two monitors showing code, mechanical keyboard, RGB accent lighting, late-night atmosphere",
  app_dev: "smartphone propped on a stand showing a mobile interface mid-prototype, sketched wireframes on paper beside it, soft natural light",
  construction: "wide shot of a high-rise construction site at golden hour, cranes silhouetted against the sky, documentary tone",
  loans: "documentary photo of a calculator, ledger, and pen on a wooden desk, hands writing visible only as silhouette, soft window light",

  // ── Niche-specific fallback scenes for the cross-vertical niches ──
  // These give every vertical a strictly on-topic static scene when the
  // article-derived customScene isn't available (retry path, or
  // summarizer returned null). Concrete environment + objects + lighting,
  // no faces, no text.
  gym_franchise:
    "wide documentary shot of the interior of a brand-new fitness gym on opening day, rows of treadmills and weight racks, polished floors, large windows with morning light, a folded ribbon near the entrance, no people",
  gym_subscription:
    "documentary photo of a modern gym floor with cardio machines and free-weight racks, a membership sign-up desk in the foreground with a tablet and brochures, bright overhead lighting, no faces",
  roofing:
    "wide documentary shot of a residential pitched roof mid-replacement, new asphalt shingles partially installed, a ladder against the eaves and roofing tools on the deck, clear daylight, suburban house",
  tax_lawyer:
    "documentary photo of a law office desk with an open legal code book, printed tax documents, a fountain pen and reading glasses, a brass desk lamp, warm window light, no people",
  pest_extermination:
    "documentary photo of a pest-control technician's equipment on a residential kitchen floor — a sprayer canister, inspection flashlight, and clipboard, baseboard visible, natural daylight, no faces",
  charity:
    "wide documentary shot of a community food-bank sorting table stacked with boxed donations and canned goods, volunteers' hands packing a box (no faces), warm indoor light, hopeful tone",
};

const DEFAULT_VISUAL =
  "documentary editorial photograph of a relevant scene, natural lighting, candid composition, no stock-photo flat-lay aesthetics";

// ── Keyword → scene overrides ──────────────────────────────────────────────
//
// When the post title or keywords match these patterns, override the
// sub-niche default with a topic-specific scene. This is what stops every
// post on a peptide blog from looking like "bottles on a shelf" regardless
// of whether the topic is ligaments, sleep, or skin.

interface KeywordScene {
  match: RegExp;
  scene: string;
}

const KEYWORD_SCENE_OVERRIDES: KeywordScene[] = [
  // Recovery / rehab specifics
  {
    match: /\b(ligament|tendon|achilles|rotator|knee|shoulder|elbow|joint)\b/i,
    scene:
      "interior of a sports rehabilitation clinic with a physiotherapist's treatment bench, kinesiology tape, an exercise band, and a foam roller in a shaft of window light",
  },
  {
    match: /\b(injury|sprain|strain|rupture|tear|fracture)\b/i,
    scene:
      "documentary photo of a runner's wrapped ankle being attended to on a treatment bench, athletic tape rolls visible, soft window light, no faces",
  },
  // Performance / muscle / growth-hormone specifics
  {
    match: /\b(muscle|strength|hypertrophy|lifting|powerlifting|bodybuilding)\b/i,
    scene:
      "low-angle shot of a heavily loaded barbell on a gym floor, chalk dust visible in overhead light, weight plates stacked against a wall in the background",
  },
  {
    match: /\b(growth\s+hormone|secretagogue|gh\s|igf|hgh)\b/i,
    scene:
      "documentary photo of an empty strength gym at dawn, single power rack lit by overhead industrial lights, polished concrete floor, no people",
  },
  {
    match: /\b(recovery|rehab|rehabilitation|healing|repair)\b/i,
    scene:
      "interior of a rehabilitation room with massage tools, a foam roller, and an athletic recovery setup on a wooden bench, soft daylight through a side window",
  },
  // Cognitive / nootropic
  {
    match: /\b(cognitive|memory|focus|attention|nootropic|brain|neural|neuro)\b/i,
    scene:
      "overhead shot of an open neuroscience textbook with anatomical brain diagrams, a pen, and a coffee cup on a wooden desk, brass reading lamp light",
  },
  // Sleep
  {
    match: /\b(sleep|insomnia|circadian|melatonin|dsip|rem|deep\s+sleep)\b/i,
    scene:
      "wide shot of a quiet bedroom at 2 AM with moonlight through curtains, an unmade bed in shadow, a single clock on the nightstand, deep blue and grey palette",
  },
  // Weight loss / GLP-1
  {
    match: /\b(weight\s+loss|metabolic|glp|appetite|satiety|obesity|adipose)\b/i,
    scene:
      "overhead documentary shot of a kitchen counter mid meal-prep — chopped vegetables on a board, a digital scale showing readings, a glass of water — natural window light",
  },
  // Aesthetic / skin / hair
  {
    match: /\b(skin|skincare|wrinkle|collagen|hair|aesthetic|cosmet)\b/i,
    scene:
      "macro photograph of a droplet of serum on textured glass, top-down studio lighting, soft minimalist composition, no labels or packaging",
  },
  // Reconstitution / technical / dosing-math
  {
    match: /\b(reconstitut|stability|formulation|compounding|bacteriostatic|sterile)\b/i,
    scene:
      "documentary photo of a working biochemistry lab bench with a researcher's gloved hand using a pipette over a sample plate, lab notebook open beside it, overhead lab lighting, no labels visible",
  },
  // Research methodology
  {
    match: /\b(study|trial|meta[\s-]?analysis|review|methodology|placebo|double[\s-]?blind|preprint)\b/i,
    scene:
      "overhead shot of open peer-reviewed journals on a wooden desk with a fountain pen, reading glasses, and a coffee cup, warm window light",
  },
  // Female-specific
  {
    match: /\b(menstrual|menopause|estrogen|progesterone|fertility|hormonal\s+cycle|pcos)\b/i,
    scene:
      "documentary photo of a quiet bedside scene with a leather-bound journal, a glass of water, and a brass clock at dawn, soft warm window light, no people",
  },
  // Regulatory / news
  {
    match: /\b(fda|regulator|approval|legal|jurisdiction|enforcement|legislation)\b/i,
    scene:
      "documentary photo of a desk with the Federal Register printed on paper, a fountain pen, and an open law book, late-afternoon light through blinds",
  },
];

function topicSceneOverride(input: GenerateImageInput): string | null {
  const haystack =
    `${input.title} ${(input.keywords ?? []).join(" ")}`.toLowerCase();
  for (const entry of KEYWORD_SCENE_OVERRIDES) {
    if (entry.match.test(haystack)) return entry.scene;
  }
  return null;
}

// ── Compound + clinical-vocabulary blocklist ───────────────────────────────

const COMPOUND_NAMES = [
  "bpc-157", "bpc157", "tb-500", "tb500", "thymosin", "ghk-cu", "ghkcu",
  "pentadeca", "kpv", "aod-9604", "aod9604",
  "semax", "selank", "cerebrolysin", "dihexa", "p21", "pinealon", "cortagen", "vesugen",
  "epitalon", "thymalin", "nad+", "mots-c", "motsc",
  "semaglutide", "tirzepatide", "retatrutide", "tesamorelin", "ozempic", "mounjaro", "wegovy",
  "ipamorelin", "cjc-1295", "cjc1295", "igf-1", "igf1", "hexarelin", "mk-677", "mk677", "ghrp-6", "ghrp6",
  "melanotan", "pt-141", "pt141", "argireline", "matrixyl",
  "kisspeptin", "oxytocin", "dsip",
  "peptide", "peptides", "research chemical", "research compound",
];

const CLINICAL_BLOCKLIST = [
  "dosage", "doses", "dose", "dosing",
  "injection", "injecting", "subcutaneous", "intramuscular",
  "vial", "vials", "syringe", "syringes", "ampoule",
  "reconstitut",
  "stack", "stacks", "stacking", "cycle", "cycles", "cycling",
  "protocol", "protocols",
  "pharmaceutical", "medication", "drug", "drugs",
  "pill", "pills", "tablet", "tablets", "capsule", "capsules",
  "off-label", "off label",
  "prescription", "prescribe", "prescribed",
];

function stripBlocklistedTerms(input: string, extras: string[] = []): string {
  let out = ` ${input.toLowerCase()} `;
  const all = [...COMPOUND_NAMES, ...CLINICAL_BLOCKLIST, ...extras.map((s) => s.toLowerCase())];
  for (const term of all) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "for", "in", "on", "at", "to",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "what", "why", "how", "when", "where", "who", "which", "that", "this",
  "these", "those", "your", "you", "guide", "ultimate", "complete",
  "comprehensive", "best", "top", "everything", "about", "understanding",
  "evidence", "based", "science",
]);

function topicalNouns(rawTitle: string, extraBlocklist: string[]): string[] {
  const cleaned = stripBlocklistedTerms(rawTitle, extraBlocklist);
  return cleaned
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 5);
}

function normalizeNicheKey(niche: string | null | undefined): string | null {
  if (!niche) return null;
  return niche.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

// ── Prompt builder ─────────────────────────────────────────────────────────

/**
 * Builds the image-generation prompt. Scene selection priority:
 *
 *   1. input.customScene — if the caller supplied a Claude-summarized scene
 *      description (built from the actual article body), use it directly.
 *      This is the highest-fidelity content-aware path.
 *   2. KEYWORD_SCENE_OVERRIDES — fall back to topical keyword matching.
 *   3. SUB_NICHE_VISUALS — peptide blog's locked sub-niche scene.
 *   4. FREE_NICHE_VISUALS / DEFAULT_VISUAL — non-peptide niches.
 *
 * The prompt leads with the SCENE (concrete subject) then adds style and
 * negative directives. Avoids buzzwords like "wellness aesthetic" and
 * "mood keywords" that push the model toward generic stock-photo output.
 */
export function buildImagePrompt(input: GenerateImageInput): string {
  // 1. Pick the scene (custom > override > sub-niche > niche > default).
  let scene: string;
  if (input.customScene && input.customScene.trim().length >= 20) {
    scene = input.customScene.trim();
  } else {
        const override = topicSceneOverride(input);
    const subNicheVisual =
      input.subNicheId !== undefined ? SUB_NICHE_VISUALS[input.subNicheId] : undefined;
    if (override) {
      scene = override;
    } else if (subNicheVisual) {
      scene = subNicheVisual;
    } else {
      const key = normalizeNicheKey(input.niche);
      scene = (key && FREE_NICHE_VISUALS[key]) || DEFAULT_VISUAL;
    }
  }

  // 2. Sanitized topical context — supplementary cue, not the lead. Only
  //    add when the scene came from a static fallback; when customScene is
  //    used, the scene already encodes the topic.
  let contextLine: string | null = null;
  if (!input.customScene) {
    const blockExtras = [
      ...(input.primaryCompounds ?? []),
      ...(input.keywords ?? []).filter((k) =>
        COMPOUND_NAMES.some((c) => k.toLowerCase().includes(c)),
      ),
    ];
    const subjectNouns = topicalNouns(input.title, blockExtras);
    if (subjectNouns.length > 0) {
      contextLine = `Visual reference: a scene that visually evokes ${subjectNouns.join(" ")}.`;
    }
  }

  // 3. Assemble. Scene first (locks subject), style second, then strong
  //    negatives. The negatives are deliberately verbose because Nano Banana
  //    keeps gravitating to bottle/shelf imagery without explicit prohibition.
  //
  //    Variant directive — "body" variant forces a different framing of
  //    the same scene so the in-content image visibly differs from the
  //    hero (which always uses the default "hero" wide-shot framing).
  const variant = input.variant ?? "hero";
  const framingDirective =
    variant === "body"
      ? "Compose as a tight detail shot or close-up at an alternative angle — " +
        "different framing from a wide establishing shot. Crop in on a meaningful " +
        "object or texture from the scene rather than the whole environment."
      : "Compose as a wide establishing shot that captures the full scene context.";
  const lead = `Realistic documentary photograph: ${scene}.`;
  const style =
    "Photojournalism style, candid composition, shallow depth of field, natural lighting only. " +
    "Magazine-quality editorial photography, not commercial or stock-photo styled. " +
    "Believable real-world setting that a working photographer would actually shoot. " +
    framingDirective;
  const negatives =
    "Strictly do not include: bottles, vials, jars, ampoules, syringes, pills, capsules, " +
    "pharmaceutical packaging, product labels, shelves with bottles arranged on them, " +
    "skincare flat-lays, perfume arrangements, wellness still lifes, pastel boutique aesthetics, " +
    "luxury product photography. " +
    "Also avoid: text of any kind, watermarks, logos, identifiable human faces, " +
    "obvious AI-generated artifacts, illustrated or cartoon styles.";

  return [lead, style, contextLine, negatives]
    .filter((p): p is string => Boolean(p))
    .join(" ");
}

// ── Google AI Studio image generation (Gemini multimodal + Imagen) ─────────

interface ImagenPrediction {
  bytesBase64Encoded?: string;
  mimeType?: string;
  raiFilteredReason?: string;
}

interface ImagenResponse {
  predictions?: ImagenPrediction[];
  error?: { message?: string; status?: string };
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
  safetyRatings?: Array<{ category?: string; probability?: string }>;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

function isImagenModel(model: string): boolean {
  return model.startsWith("imagen-");
}

async function callImagenPredict(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const url = `${GOOGLE_BASE}/${model}:predict?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          personGeneration: "ALLOW_ADULT",
          safetyFilterLevel: "block_only_high",
        },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as ImagenResponse;
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Imagen request failed: ${msg}`);
    }
    const pred = body.predictions?.[0];
    if (!pred) {
      throw new Error("Imagen response missing predictions");
    }
    if (pred.raiFilteredReason) {
      throw new Error(`Imagen blocked by safety filter: ${pred.raiFilteredReason}`);
    }
    if (!pred.bytesBase64Encoded) {
      throw new Error("Imagen response missing image bytes");
    }
    return {
      bytes: Buffer.from(pred.bytesBase64Encoded, "base64"),
      mimeType: pred.mimeType ?? "image/png",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiGenerateContent(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const url = `${GOOGLE_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const instruction = `Generate a single editorial photograph based on this description. Return only the image, no preamble text. Description: ${prompt}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: instruction }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      throw new Error(`Gemini image request failed: ${msg}`);
    }
    if (body.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked by safety filter: ${body.promptFeedback.blockReason}`);
    }
    const candidate = body.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      throw new Error(
        `Gemini response missing parts (finishReason=${candidate?.finishReason ?? "unknown"})`,
      );
    }
    for (const part of candidate.content.parts) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      const mimeType =
        (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || "image/png";
      if (data) {
        return { bytes: Buffer.from(data, "base64"), mimeType };
      }
    }
    throw new Error("Gemini response contained no image bytes (only text)");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns true when a Google image error is worth retrying. 429 (quota),
 * 503 (unavailable), 500 (internal), timeouts, and "overloaded" responses
 * are transient. Safety-filter blocks and 400-level auth/argument errors
 * are not retryable.
 */
function isTransientGoogleError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("blocked by safety filter")) return false;
  if (msg.includes("rai filter") || msg.includes("filtered")) return false;
  if (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("internal server error") ||
    msg.includes("http 429") ||
    msg.includes("http 500") ||
    msg.includes("http 502") ||
    msg.includes("http 503") ||
    msg.includes("http 504")
  ) {
    return true;
  }
  return false;
}

const MAX_GOOGLE_RETRIES = 2;
const GOOGLE_BACKOFF_BASE_MS = 3000; // 3s, 6s

async function callGoogleImage(
  prompt: string,
  model: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }
  const fn = isImagenModel(model) ? callImagenPredict : callGeminiGenerateContent;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_GOOGLE_RETRIES; attempt++) {
    try {
      return await fn(apiKey, model, prompt);
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_GOOGLE_RETRIES) break;
      if (!isTransientGoogleError(err)) break;
      const delayMs = GOOGLE_BACKOFF_BASE_MS * Math.pow(2, attempt);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[image-generator] Transient Google error (attempt ${attempt + 1}/${MAX_GOOGLE_RETRIES + 1}), retrying in ${delayMs}ms: ${msg.slice(0, 200)}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function bytesToDataUri(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

/** True when a Google error is a quota / billing / rate cap (vs. a safety
 * block or bad request). Quota blocks are fixable by switching models;
 * other failures are not, so we don't waste the free model on them. */
function isGoogleQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("billing") ||
    msg.includes("limit: 0") ||
    msg.includes("http 429") ||
    msg.includes("resource_exhausted")
  );
}

/**
 * Produce one image for the given variant. Google-only:
 *   1. The configured (paid) model — GOOGLE_IMAGE_MODEL.
 *   2. If that's QUOTA-blocked, step down to a free-tier Google model
 *      (GOOGLE_FALLBACK_MODEL, default gemini-2.5-flash-image). Nano Banana
 *      *Pro* (gemini-3-pro-image) has NO free tier — limit: 0 — so a
 *      free-tier key must fall back to a flash model or it can never make
 *      an image.
 * Throws if both fail — the caller then runs its static-scene retry and,
 * failing that, ships the post without this image.
 */
async function produceImage(
  input: GenerateImageInput,
  variant: "hero" | "body",
): Promise<GeneratedImage> {
  const prompt = buildImagePrompt({ ...input, variant });
  const primaryModel = process.env.GOOGLE_IMAGE_MODEL || GOOGLE_DEFAULT_MODEL;

  // Google model chain — primary, then a free-tier model when the primary
  // is quota-blocked (deduped so we never call the same model twice).
  const googleModels = [primaryModel];
  if (GOOGLE_FALLBACK_MODEL && GOOGLE_FALLBACK_MODEL !== primaryModel) {
    googleModels.push(GOOGLE_FALLBACK_MODEL);
  }

  let lastGoogleErr: unknown;
  for (const model of googleModels) {
    try {
      const { bytes, mimeType } = await callGoogleImage(prompt, model);
      return {
        url: bytesToDataUri(bytes, mimeType),
        provider: "google",
        hosting: "data_uri",
        promptUsed: prompt,
        model,
      };
    } catch (err) {
      lastGoogleErr = err;
      // Only step down to the free model when the failure is a quota block.
      // A safety-filter block or 400 won't be fixed by switching models.
      if (!isGoogleQuotaError(err)) break;
      console.warn(
        `[image-generator] Google model "${model}" quota-blocked — stepping down to free model`,
      );
    }
  }

  // Both Google models failed — rethrow so the caller's existing
  // static-scene retry / ship-image-less logic runs.
  throw lastGoogleErr;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a topic-aware hero image. Tries the configured (paid) Google
 * model first, then steps down to a free-tier Google model if the primary
 * is quota-blocked. Throws only if both fail — the caller then ships the
 * post without a hero image.
 */
export async function generateHeroImage(
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  return produceImage(input, "hero");
}

/**
 * Generate a deliberately different second image for the body of the post.
 *
 * Same topic and customScene as the hero, but the prompt requests a
 * close-up / detail / alternative-angle framing so the in-content image
 * doesn't look like a duplicate of the featured image. Stochastic
 * variation in Nano Banana further differentiates the two outputs.
 *
 * Tries the same Google model chain as the hero (paid model, then free-tier
 * step-down on quota). Throws only if both fail — caller decides whether to
 * ship the post with just a hero image.
 */
export async function generateBodyImage(
  input: GenerateImageInput,
): Promise<GeneratedImage> {
  return produceImage(input, "body");
}

/** Pretty-print the image-generation context for logs. */
export function describeImageContext(input: GenerateImageInput): string {
  const parts: string[] = [];
  if (input.subNicheId !== undefined) {
    const sub = SUB_NICHES[input.subNicheId];
    if (sub) parts.push(`sub-niche ${sub.id} (${sub.name})`);
  }
  if (input.niche) parts.push(`niche=${input.niche}`);
  if (input.keywords?.length) parts.push(`keywords=${input.keywords.slice(0, 3).join(",")}`);
  return parts.join("; ") || "no context";
}
