import Anthropic from "@anthropic-ai/sdk";
import { composeForPost } from "@/lib/content/composer/compose";
import { runScrubber, runScrubberLite, type ScrubberReport } from "@/lib/content/scrubber";
import type { StyleProfile } from "@/lib/content/types";
import { SUB_NICHES } from "@/lib/content/libraries/sub-niches";
import {
  generateBodyImage,
  generateHeroImage,
} from "@/lib/services/image-generator";

// Match the model used elsewhere in the project.
const CLAUDE_MODEL = "claude-sonnet-4-5";

// Sonnet 4.5 pricing — per-token (USD), not per-1K. Verify current rates at
// https://www.anthropic.com/pricing before relying on cost reporting.
// As of writing: $3 / 1M input tokens, $15 / 1M output tokens.
const PRICING = {
  inputPerToken: 0.000003,
  outputPerToken: 0.000015,
};

// Network-wide word-count policy. Single source of truth lives in
// src/lib/content/config.ts. Imported here so both the legacy
// (non-profile) generation path and the profile-driven path use the
// same range. Change those constants once to shift the policy
// everywhere.
import {
  GLOBAL_WORD_BAND_MAX,
  GLOBAL_WORD_BAND_MIN,
} from "@/lib/content/config";
import {
  takeNewsContextForVertical,
  formatNewsContextForPrompt,
  getRecentNewsForVerticalInternal,
} from "@/lib/actions/news-actions";

const MIN_WORDS = GLOBAL_WORD_BAND_MIN;
const MAX_WORDS = GLOBAL_WORD_BAND_MAX;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Niche contexts ─────────────────────────────────────────────────────────

interface NicheContext {
  label: string;
  industry: string;
  defaultAudience: string;
  defaultBrandVoice: string;
  contentStyle: string;
  keyTopics: string[];
}

const NICHE_CONTEXTS: Record<string, NicheContext> = {
  reputation_sites: {
    label: "Good Reputation Sites & Reviews",
    industry: "Reputation Management",
    defaultAudience: "Business owners, consumers, marketers researching reviews",
    defaultBrandVoice: "professional and balanced, ethical consultant",
    contentStyle: "Balanced perspective addressing both business and consumer viewpoints, platform-specific details, ethical practices only",
    keyTopics: ["Trustpilot", "Yelp", "Google Reviews", "BBB", "G2", "review response", "fake reviews", "reputation management"],
  },
  peptides: {
    label: "Peptides & Performance Enhancement",
    industry: "Health & Performance",
    defaultAudience: "Bodybuilders, biohackers, anti-aging seekers, researchers, medical professionals",
    defaultBrandVoice: "scientific yet accessible, evidence-based",
    contentStyle: "Scientific credibility with E-A-T compliance, reference actual studies, acknowledge limitations, never recommend suppliers",
    keyTopics: ["BPC-157", "TB-500", "peptide protocols", "growth hormone", "tissue repair", "clinical research"],
  },
  gambling: {
    label: "Gambling & Sports Betting",
    industry: "Sports Betting",
    defaultAudience: "Casual bettors to sharp players seeking statistical analysis",
    defaultBrandVoice: "analytical, data-driven, responsible",
    contentStyle: "Statistical analysis over hot takes, acknowledge most bettors lose, responsible gambling framework, real odds examples",
    keyTopics: ["closing line value", "expected value", "bankroll management", "line movement", "betting strategy", "+EV spots"],
  },
  apps_marketing: {
    label: "Apps Marketing & Reviews",
    industry: "Mobile Apps & Software",
    defaultAudience: "App users, productivity seekers, buyers researching software",
    defaultBrandVoice: "honest reviewer, practical and helpful",
    contentStyle: "Test apps when possible, mention limitations honestly, real pricing, platform differences (iOS vs Android)",
    keyTopics: ["app reviews", "productivity apps", "app comparison", "mobile software", "app features", "user experience"],
  },
  exclusive_models: {
    label: "Creator Platforms & OnlyFans Business",
    industry: "Creator Economy",
    defaultAudience: "Aspiring creators, current creators, business researchers",
    defaultBrandVoice: "professional business advisor, entrepreneurial consultant",
    contentStyle: "Business-first framing not explicit content, frame as entrepreneurship, real numbers on fees and earnings, respect creator autonomy",
    keyTopics: ["OnlyFans", "Fansly", "creator monetization", "content marketing", "subscriber retention", "creator business", "platform fees"],
  },
  ecom_nails: {
    label: "Nails & Beauty E-commerce",
    industry: "Beauty & Cosmetics",
    defaultAudience: "Beginners to experienced home manicurists, beauty enthusiasts",
    defaultBrandVoice: "practical and experienced, helpful beauty enthusiast",
    contentStyle: "Correct product terminology, reference actual brands with real prices, include timing, describe looks specifically",
    keyTopics: ["gel polish", "nail art", "chrome powder", "builder gel", "manicure techniques", "nail products", "nail trends"],
  },
  soccer_jersey: {
    label: "Soccer Jerseys & Fan Merchandise",
    industry: "Sports Merchandise",
    defaultAudience: "Passionate fans, collectors, parents, gift buyers",
    defaultBrandVoice: "knowledgeable fan perspective, experienced collector",
    contentStyle: "Distinguish authentic vs replica vs counterfeit, use proper terminology (kit, strip), sizing by manufacturer, authentication methods",
    keyTopics: ["authentic jerseys", "replica jerseys", "soccer kits", "jersey sizing", "fan merchandise", "jersey collecting", "team jerseys"],
  },
  payment_processing: {
    label: "Payment Processing & Fintech",
    industry: "Financial Technology",
    defaultAudience: "Business owners, financial decision-makers, developers, e-commerce operators",
    defaultBrandVoice: "business consultant, fintech expert, technical advisor",
    contentStyle: "Use correct terminology (interchange, acquirer, PSP), real fee structures, include hidden costs, compliance requirements",
    keyTopics: ["Stripe", "Square", "payment gateway", "transaction fees", "PCI compliance", "merchant account", "payment integration"],
  },
  web_dev: {
    label: "Web Development",
    industry: "Software Development",
    defaultAudience: "Beginners to experienced developers evaluating tools and approaches",
    defaultBrandVoice: "experienced developer, pragmatic engineer",
    contentStyle: "Use current web standards, reference actual versions (React 18, Node 20), address trade-offs honestly, explain why not just how",
    keyTopics: ["React", "Next.js", "JavaScript", "web performance", "frameworks", "frontend development", "backend development"],
  },
  app_dev: {
    label: "App Development",
    industry: "Mobile Development",
    defaultAudience: "Entrepreneurs, business stakeholders, developers evaluating platforms",
    defaultBrandVoice: "realistic consultant, mobile development expert",
    contentStyle: "Balance business and technical perspectives, honest cost ranges and timelines, include ongoing costs, post-launch reality",
    keyTopics: ["React Native", "Flutter", "iOS development", "Android development", "app costs", "mobile development", "cross-platform"],
  },
  construction: {
    label: "Construction & B2B Services",
    industry: "Construction",
    defaultAudience: "Contractors, subcontractors, construction business owners, project managers",
    defaultBrandVoice: "industry veteran, construction business consultant",
    contentStyle: "Use correct construction terminology (GC, sub, bid process), real cost ranges, regulatory requirements, regional differences",
    keyTopics: ["commercial construction", "bidding strategy", "project management", "subcontractors", "construction business", "permits"],
  },
  loans: {
    label: "Loans & Lending",
    industry: "Financial Services",
    defaultAudience: "Borrowers researching options, credit rebuilders, financial education seekers",
    defaultBrandVoice: "responsible financial advisor, consumer advocate",
    contentStyle: "Use correct financial terminology (APR, LTV, DTI), show total cost not just monthly payment, address predatory lending red flags",
    keyTopics: ["personal loans", "mortgage", "APR", "interest rates", "credit score", "loan qualification", "debt consolidation"],
  },
  tax_lawyer: {
    label: "Tax Law & IRS Representation",
    industry: "Legal Services",
    defaultAudience: "Individuals and business owners facing tax issues, CPAs researching legal options, small business owners",
    defaultBrandVoice: "authoritative legal advisor, plain-English translator of tax code",
    contentStyle: "Cite specific IRC sections and real penalty schedules, distinguish federal vs state, use concrete dollar examples and timelines, always note this is general info not legal advice",
    keyTopics: ["IRS audit", "tax debt settlement", "offer in compromise", "innocent spouse relief", "FBAR penalties", "back taxes", "wage garnishment", "tax court", "installment agreement"],
  },
  charity: {
    label: "Charity & Nonprofit Operations",
    industry: "Nonprofit Sector",
    defaultAudience: "Nonprofit founders, board members, donors, fundraisers, grant writers",
    defaultBrandVoice: "mission-driven advisor, experienced nonprofit operator",
    contentStyle: "Reference real 501(c)(3) requirements and actual grant sources, cite donor psychology research, include realistic budgets and overhead ratios, cover legal compliance honestly",
    keyTopics: ["501(c)(3) status", "donor retention", "grant writing", "fundraising campaigns", "nonprofit governance", "Form 990", "Giving Tuesday", "donor stewardship", "capital campaigns"],
  },
  pest_extermination: {
    label: "Pest Control & Extermination",
    industry: "Pest Management Services",
    defaultAudience: "Homeowners with pest issues, property managers, small business owners, DIY-curious researchers",
    defaultBrandVoice: "experienced pest control professional, practical exterminator",
    contentStyle: "Use correct pest names (German cockroach vs American), seasonal pest patterns, real product names (Termidor, Advion), distinguish DIY vs professional treatments, address safety for pets and children",
    keyTopics: ["termites", "bed bugs", "cockroach treatment", "rodent control", "ant infestations", "wasp removal", "integrated pest management", "preventive maintenance", "pest inspections"],
  },
  roofing: {
    label: "Roofing & Roof Repair",
    industry: "Roofing Contracting",
    defaultAudience: "Homeowners needing repairs or replacement, property managers, contractors comparing materials",
    defaultBrandVoice: "experienced roofing contractor, practical industry veteran",
    contentStyle: "Distinguish material types (asphalt shingle, metal, tile, TPO), give real cost ranges per square, address regional climate considerations and warranty terms, walk through insurance claim processes honestly",
    keyTopics: ["asphalt shingles", "metal roofing", "roof replacement cost", "storm damage claims", "roof inspections", "flashing", "underlayment", "roof leaks", "TPO commercial roofing"],
  },
  gym_subscription: {
    label: "Gym Memberships & Fitness Subscriptions",
    industry: "Fitness & Wellness",
    defaultAudience: "Consumers comparing gyms, fitness beginners, gym owners researching the market, budget-conscious health seekers",
    defaultBrandVoice: "honest fitness consultant, practical gym-goer",
    contentStyle: "Compare actual chains (Planet Fitness, LA Fitness, Equinox) with real prices, contract terms, and cancellation policies, distinguish big-box vs boutique vs class-based, address hidden fees honestly",
    keyTopics: ["Planet Fitness", "Equinox", "ClassPass", "CrossFit memberships", "gym contracts", "cancellation policies", "boutique fitness", "personal training costs", "gym comparison"],
  },
  gym_franchise: {
    label: "Gym Franchise Openings & Launches",
    industry: "Fitness Franchise",
    defaultAudience: "Local readers tracking new fitness options, prospective first-time members, fitness journalists, franchise operators",
    defaultBrandVoice: "local fitness journalist covering opening-day stories",
    contentStyle: "Focused on NEW gym launches and franchise openings — not ongoing membership comparisons (that's a separate niche). Cover ribbon-cutting dates, founder backgrounds, equipment partners, opening-day promotions, the franchise's local footprint. Name specific chains by their real local names — in Quebec: Énergie Cardio, Éconofitness, Nautilus Plus, Buzzfit, World Gym. Distinguish franchise vs corporate vs independent. Mention permit timing or municipal context when known.",
    keyTopics: ["new gym opening", "franchise launch", "ribbon cutting", "grand opening promotions", "franchise owner", "Énergie Cardio", "Éconofitness", "Nautilus Plus", "Buzzfit", "World Gym", "first-month free", "equipment partner", "build-out timeline"],
  },
};

const DEFAULT_NICHE: NicheContext = {
  label: "General",
  industry: "General",
  defaultAudience: "general audience",
  defaultBrandVoice: "professional and informative",
  contentStyle: "clear and engaging",
  keyTopics: [],
};

/**
 * Normalize a free-text niche string to one of the canonical NICHE_CONTEXTS keys.
 *
 * Admins type values like "Peptides", "PEPTIDES", "Web Dev", or "payment_processing"
 * — we lowercase, trim, and convert spaces/hyphens to underscores so any
 * reasonable input maps to the right context.
 */
export function normalizeNicheKey(niche: string | null | undefined): string | null {
  if (!niche) return null;
  return niche.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Turn a raw niche string into a human-readable label.
 *
 *   "Dog Grooming"  → "Dog Grooming"
 *   "dog_grooming"  → "Dog Grooming"
 *   "DOG-GROOMING"  → "Dog Grooming"
 *
 * Used when synthesizing a NicheContext on the fly for unregistered niches
 * so the ideation + article prompts still get a real topical anchor instead
 * of falling back to a generic "General" placeholder.
 */
function humanizeNiche(raw: string): string {
  return raw
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function getNicheContext(niche: string | null | undefined): NicheContext {
  const key = normalizeNicheKey(niche);
  if (!key) return DEFAULT_NICHE;

  const registered = NICHE_CONTEXTS[key];
  if (registered) return registered;

  // Unregistered niche — synthesize a context from the typed string so
  // Claude is still grounded in the admin's intent (e.g. "Dog Grooming"
  // produces "blog topics for a Dog Grooming niche site"). The 17 curated
  // niches above still give sharper output because of their hand-tuned
  // keyTopics, audience, voice, and style cues — but a synthesized context
  // is far better than silently writing about "general" topics.
  const label = humanizeNiche(niche!);
  return {
    label,
    industry: label,
    defaultAudience: `readers interested in ${label.toLowerCase()}`,
    defaultBrandVoice: "knowledgeable and helpful, evidence-based",
    contentStyle:
      "clear and specific, use real names and numbers when possible, acknowledge limitations honestly, avoid generic filler",
    keyTopics: [],
  };
}

export function getAvailableNiches(): Array<{ key: string; label: string }> {
  return Object.entries(NICHE_CONTEXTS).map(([key, ctx]) => ({ key, label: ctx.label }));
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type Tone = "professional" | "casual" | "friendly" | "authoritative" | "technical" | "warm";

export interface GenerateOptions {
  topic: string;
  keywords: string[];
  wordCount: number;
  tone: Tone;
  niche?: string | null;
  brandVoice?: string;
  targetAudience?: string;
  seoOptimized?: boolean;
  /**
   * When present, the composer uses this style profile to build the prompt
   * via the skeleton pipeline (overrides the niche-based default prompt).
   * The scrubber also runs profile-aware checks on the generated content.
   */
  styleProfile?: StyleProfile;
  /**
   * Vertical key (from src/lib/content/verticals/registry.ts). When set
   * AND the niche is not peptides, the generator pulls recent news
   * items for this vertical and instructs Claude to weave 1-3 of them
   * in as external `<a href>` links — adds topical credibility AND
   * outbound link signal for SEO. Peptide blogs intentionally skip
   * external news links for compliance.
   */
  verticalKey?: string | null;
  /**
   * Output language for the article. Comes from the vertical config's
   * `language` field.
   *   "en"    → English (default)
   *   "fr"    → French (Québec-French phrasing for the QC verticals)
   *   "en_fr" → bilingual vertical; defaults to English here (per-track
   *             FR handling lives in the charity vertical's contentTracks)
   * When undefined or "en", no language directive is added and Claude
   * writes in English as before.
   */
  language?: "en" | "fr" | "en_fr";
  /**
   * Per-blog stylistic seed. When provided, the legacy (non-profile) path
   * uses it to deterministically pick:
   *   - 2 writing-habit quirks from QUIRK_POOL
   *   - a per-blog word band drawn from inside [GLOBAL_WORD_BAND_MIN,
   *     GLOBAL_WORD_BAND_MAX]
   *   - a body-image wrapper class name
   * Same seed → same picks always. The cron passes `blog.id` so each blog
   * keeps a stable, distinct voice. Profile blogs (peptides) ignore this
   * field — their composer already does per-blog randomization.
   */
  blogSeed?: string;
  /**
   * Pre-fetched internal sibling post references for inline link injection.
   * Each entry is a previously-published post on the SAME blog. Claude is
   * instructed to weave 2-4 of these as inline <a href> links — adds the
   * single SEO signal the audit flagged as missing (internal link graph).
   */
  internalLinkRefs?: Array<{ title: string; url: string }>;
}

export interface GeneratedContent {
  title: string;
  content: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  wordCount: number;
}

export interface AnalysisScores {
  seoScore: number;
  readabilityScore: number;
  brandVoiceScore: number;
}

export interface GenerationResult extends GeneratedContent, AnalysisScores {
  tokensUsed: number;
  costUsd: number;
  heroImageUrl?: string;
  /**
   * Second deliberately differently-framed image for the body of the
   * post. Already embedded into `content` HTML at the midpoint by the
   * generator; surfaced here too so the caller can persist it on its
   * own column without HTML-parsing.
   */
  bodyImageUrl?: string;
  /** Scrubber audit trail, populated when scrubber runs. */
  scrubberReport?: ScrubberReport;
  /** True if scrubber flagged this post for admin review. */
  flaggedForReview?: boolean;
}

// ─── Claude wrapper ─────────────────────────────────────────────────────────

interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Bracket-aware JSON extraction. Walks the text from the first `{`, tracks
 * brace depth while ignoring braces inside string literals, and returns
 * the substring of the first complete top-level object.
 *
 * Handles every shape Claude has produced in the wild:
 *
 *   {...}                            ← clean
 *   ```json\n{...}\n```              ← markdown-fenced
 *   ```\n{...}\n```                  ← bare-fenced
 *   "Here is the JSON: {...} done."  ← prose-wrapped
 *   {...}\n```                       ← trailing fence
 *   \n  {...}\n{...}                 ← multiple objects (returns first)
 *
 * Unlike the previous naive "first { to last }" version, this never
 * mistakes a `}` inside a string value for the closing brace.
 */
function extractJsonObject(text: string): string {
  const startIdx = text.indexOf("{");
  if (startIdx === -1) return text.trim();

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.substring(startIdx, i + 1);
      }
    }
  }

  // Hit end without closing — response was truncated. Return what we have
  // so the caller can attempt repair / decide whether to retry.
  return text.substring(startIdx);
}

/**
 * Repair common LLM JSON issues that JSON.parse rejects but we can
 * confidently fix:
 *
 *   1. Trailing commas inside arrays / objects: `[1,2,3,]` → `[1,2,3]`
 *   2. Unescaped control chars inside strings: literal `\n`, `\r`, `\t`
 *      become escaped `\\n`, `\\r`, `\\t` (Claude sometimes embeds raw
 *      newlines in HTML content fields)
 *   3. Smart quotes around keys: `"key"` → `"key"`
 *
 * Things this does NOT fix (would require a real parser):
 *   - Unescaped double quotes inside string values
 *   - Comments
 *   - Single-quoted strings
 *
 * Caller falls back to retrying the Claude call if these heuristics
 * aren't enough.
 */
function repairLlmJson(text: string): string {
  // Smart quotes anywhere (Claude rarely produces these but it has)
  let result = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // Walk the text and escape literal control chars only inside string
  // literals (where they're invalid JSON). Outside strings they're just
  // whitespace and JSON.parse accepts them.
  let fixed = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < result.length; i++) {
    const ch = result[i];

    if (escape) {
      fixed += ch;
      escape = false;
      continue;
    }

    if (inString && ch === "\\") {
      fixed += ch;
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      fixed += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") {
        fixed += "\\n";
        continue;
      }
      if (ch === "\r") {
        fixed += "\\r";
        continue;
      }
      if (ch === "\t") {
        fixed += "\\t";
        continue;
      }
    }

    fixed += ch;
  }
  result = fixed;

  // Strip trailing commas: ", ]" → " ]", ", }" → " }". Regex is safe here
  // because we only target the comma followed by closing bracket; it
  // doesn't matter whether we're inside a string because LLMs essentially
  // never embed literal `, ]` patterns inside string values.
  result = result.replace(/,(\s*[\]}])/g, "$1");

  return result;
}

/**
 * Repair unescaped double quotes that appear INSIDE JSON string values.
 *
 * Classic Claude failure mode: emits HTML inside a string field with
 * unescaped attribute quotes, e.g.
 *
 *   { "content": "<a href="https://example.com">link</a>" }
 *
 * The inner `"` characters close the string prematurely; downstream
 * parsing fails with "Expected ',' or '}' after property value" deep in
 * the response.
 *
 * Strategy: walk the text. At every `"`, decide whether it's a real
 * string boundary or an escaped-but-Claude-forgot-to-escape quote by
 * looking at the next non-whitespace character:
 *
 *   `: , } ] EOF`  → real boundary (key terminator / value separator / structural)
 *   anything else  → unescaped quote inside a value; escape it
 *
 * Tolerates correctly-escaped backslash-quote pairs and ignores quotes
 * outside string context.
 */
function escapeStrayQuotesInsideStrings(text: string): string {
  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      result += ch;
      escape = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escape = true;
      continue;
    }

    if (ch !== '"') {
      result += ch;
      continue;
    }

    // We hit a `"`. Decide: open, close, or stray-inside-value?
    if (!inString) {
      // Outside any string — this opens a new one.
      inString = true;
      result += ch;
      continue;
    }

    // We're inside a string. Look ahead at the next non-whitespace char.
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    const next = j < text.length ? text[j] : undefined;

    const isBoundary =
      next === undefined ||  // end of input
      next === ":" ||
      next === "," ||
      next === "}" ||
      next === "]";

    if (isBoundary) {
      // Valid string close.
      inString = false;
      result += ch;
    } else {
      // Stray unescaped quote inside the value — escape it.
      result += '\\"';
    }
  }

  return result;
}

/**
 * Repair JSON that was TRUNCATED mid-output (Claude hit max_tokens before
 * closing the last string and the wrapping braces). Strategy:
 *
 *   1. Walk the text tracking string-context, escape-context, and the
 *      bracket stack ({ vs [).
 *   2. Find the last position where a complete key-value pair ended
 *      (i.e. a `,` at object depth, outside any string). This is the
 *      safe truncation point that keeps a valid JSON object.
 *   3. If found, truncate the text there and close all open brackets.
 *      The post loses the in-progress field but everything else parses.
 *   4. If no clean boundary found (very short response), close the
 *      open string + brackets as a last resort.
 *
 * The post will be shorter than the originally-requested word count, but
 * still publishable. The scrubber's word-count check (Layer 1F) catches
 * it and can request regeneration if needed.
 */
function repairTruncatedJson(text: string): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastSafeBoundary = -1; // position right BEFORE a `,` at object depth
  const stack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      stack.push("{");
      depth++;
    } else if (ch === "[") {
      stack.push("[");
    } else if (ch === "}") {
      stack.pop();
      depth--;
    } else if (ch === "]") {
      stack.pop();
    } else if (
      ch === "," &&
      stack.length > 0 &&
      stack[stack.length - 1] === "{"
    ) {
      lastSafeBoundary = i;
    }
  }

  // If parse-state ended cleanly, the input is fine.
  if (!inString && depth === 0 && stack.length === 0) {
    return text;
  }

  // Prefer truncating at the last safe object-level comma boundary.
  let result: string;
  if (lastSafeBoundary > 0) {
    result = text.substring(0, lastSafeBoundary);
  } else {
    result = text;
    // Close any in-progress string.
    if (inString) result += '"';
  }

  // Recount open brackets at the truncated position and close them.
  let d = 0;
  let inStr = false;
  let esc = false;
  const closeStack: string[] = [];
  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      closeStack.push("{");
      d++;
    } else if (ch === "[") closeStack.push("[");
    else if (ch === "}") {
      closeStack.pop();
      d--;
    } else if (ch === "]") closeStack.pop();
  }
  if (inStr) result += '"';
  while (closeStack.length > 0) {
    const open = closeStack.pop();
    result += open === "{" ? "}" : "]";
  }

  return result;
}

/**
 * Tolerant article-shape normalizer. Handles the most common ways Claude
 * deviates from the requested {title, content, excerpt, ...} envelope:
 *
 *   1. Wraps the article in an outer object: {"article": {...}} or
 *      {"data": {...}} or {"response": {...}}
 *   2. Renames "content" to "html", "body", "article_html", or "article_body"
 *   3. Renames "title" to "headline" or "post_title"
 *   4. Splits the article into parts instead of one content string:
 *        - {intro, items[]}            → listicle
 *        - {intro, body, conclusion}   → three-part
 *        - {sections: [{heading, content}, ...]}
 *        - {paragraphs: ["...", "..."]}
 *        - {content: [...]} (array instead of string)
 *      These get stitched into a single HTML string.
 *
 * Returns the (possibly unwrapped + remapped) partial. Other shape mismatches
 * surface as the "missing required fields" error with the actual key list.
 */
function normalizeArticleShape(
  parsed: Partial<GeneratedContent> & Record<string, unknown>,
): Partial<GeneratedContent> {
  // Unwrap a single-key wrapper that looks like the real envelope.
  const wrapperKeys = ["article", "data", "response", "result", "output"];
  for (const key of wrapperKeys) {
    const inner = parsed[key];
    if (
      inner &&
      typeof inner === "object" &&
      !Array.isArray(inner) &&
      ("title" in (inner as object) ||
        "content" in (inner as object) ||
        "intro" in (inner as object) ||
        "sections" in (inner as object))
    ) {
      parsed = inner as Partial<GeneratedContent> & Record<string, unknown>;
      break;
    }
  }

  // Remap alternate field names.
  if (!parsed.title) {
    const titleAlt = parsed.headline ?? parsed.post_title ?? parsed.article_title;
    if (typeof titleAlt === "string") parsed.title = titleAlt;
  }
  if (!parsed.content) {
    const contentAlt =
      parsed.html ?? parsed.body ?? parsed.article_html ?? parsed.article_body;
    if (typeof contentAlt === "string") parsed.content = contentAlt;
  }

  // Multi-part reconstruction — stitch alternate part-shaped responses
  // into a single HTML content string. Only runs when `content` is still
  // missing, so a well-formed response is never touched.
  if (!parsed.content || typeof parsed.content !== "string") {
    const stitched = reconstructContentFromParts(parsed);
    if (stitched) {
      parsed.content = stitched;
    }
  }

  return parsed;
}

/**
 * Stitch a Claude response that returned the article as parts into a
 * single HTML string. Best-effort — returns null when nothing usable is
 * found so the caller can fall through to the "missing required fields"
 * error with the original key list.
 *
 * Handles (in priority order):
 *
 *   {sections: [{heading, content}, ...]}
 *      → <h2>heading</h2><p>content</p> for each section
 *   {intro: "...", items: ["...", ...]}
 *      → <p>intro</p><ul><li>item</li>...</ul>
 *   {intro: "...", items: [{heading, body}, ...]}
 *      → <p>intro</p><h2>heading</h2><p>body</p>...
 *   {intro, body, conclusion}
 *      → <p>intro</p>...body...<p>conclusion</p>
 *   {paragraphs: ["...", ...]}
 *      → <p>p1</p><p>p2</p>...
 *   {content: ["string", "string"]}   (array instead of string)
 *      → joined as <p>...</p> blocks
 */
function reconstructContentFromParts(
  parsed: Record<string, unknown>,
): string | null {
  const out: string[] = [];

  const intro = parsed["intro"];
  const items = parsed["items"];
  const sections = parsed["sections"];
  const paragraphs = parsed["paragraphs"];
  const conclusion = parsed["conclusion"];
  const bodyText = parsed["body"];
  const contentAny = parsed["content"];

  // sections: [{heading, content|body|text}]
  if (Array.isArray(sections) && sections.length > 0) {
    if (typeof intro === "string") out.push(maybeWrapHtml(intro));
    for (const sec of sections) {
      if (!sec || typeof sec !== "object") continue;
      const s = sec as Record<string, unknown>;
      const heading = pickString(s, ["heading", "title", "header"]);
      const text = pickString(s, ["content", "body", "text", "paragraph"]);
      if (heading) out.push(`<h2>${escapeHtml(heading)}</h2>`);
      if (text) out.push(maybeWrapHtml(text));
    }
    if (typeof conclusion === "string") out.push(maybeWrapHtml(conclusion));
    return out.length > 0 ? out.join("\n") : null;
  }

  // intro + items (listicle or part-shaped)
  if (Array.isArray(items) && items.length > 0) {
    if (typeof intro === "string") out.push(maybeWrapHtml(intro));
    const allStrings = items.every((it) => typeof it === "string");
    if (allStrings) {
      // Plain listicle — items are bullet strings.
      out.push("<ul>");
      for (const it of items as string[]) {
        out.push(`<li>${escapeHtml(it)}</li>`);
      }
      out.push("</ul>");
    } else {
      // Object items — usually {heading/title, body/content/description}.
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const i = it as Record<string, unknown>;
        const heading = pickString(i, ["heading", "title", "header", "name"]);
        const text = pickString(i, [
          "body",
          "content",
          "description",
          "text",
          "paragraph",
        ]);
        if (heading) out.push(`<h2>${escapeHtml(heading)}</h2>`);
        if (text) out.push(maybeWrapHtml(text));
      }
    }
    if (typeof conclusion === "string") out.push(maybeWrapHtml(conclusion));
    return out.length > 0 ? out.join("\n") : null;
  }

  // intro + body + conclusion (three-part essay shape)
  if (
    typeof intro === "string" ||
    typeof bodyText === "string" ||
    typeof conclusion === "string"
  ) {
    if (typeof intro === "string") out.push(maybeWrapHtml(intro));
    if (typeof bodyText === "string") out.push(maybeWrapHtml(bodyText));
    if (typeof conclusion === "string") out.push(maybeWrapHtml(conclusion));
    return out.length > 0 ? out.join("\n") : null;
  }

  // paragraphs: [...]
  if (Array.isArray(paragraphs) && paragraphs.length > 0) {
    for (const p of paragraphs) {
      if (typeof p === "string") out.push(maybeWrapHtml(p));
    }
    return out.length > 0 ? out.join("\n") : null;
  }

  // content: ["string", "string"] — array instead of string
  if (Array.isArray(contentAny) && contentAny.length > 0) {
    for (const c of contentAny) {
      if (typeof c === "string") out.push(maybeWrapHtml(c));
    }
    return out.length > 0 ? out.join("\n") : null;
  }

  return null;
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * If the input already looks like HTML (has angle-bracket tags), pass
 * it through. Otherwise wrap it as a paragraph.
 */
function maybeWrapHtml(text: string): string {
  const trimmed = text.trim();
  if (/<\s*(p|h[1-6]|ul|ol|li|strong|em|a|br|div|section)\b/i.test(trimmed)) {
    return trimmed;
  }
  return wrapParagraph(trimmed);
}

function wrapParagraph(text: string): string {
  return `<p>${escapeHtml(text)}</p>`;
}

/**
 * Try JSON.parse on:
 *   1. The raw text                  (the happy path)
 *   2. Light repair                  (smart quotes, trailing commas, control chars)
 *   3. Stray-quote repair            (escape unescaped " inside string values,
 *                                     e.g. HTML attribute quotes Claude forgot
 *                                     to backslash-escape)
 *   4. Truncation repair             (closes unterminated strings + braces,
 *                                     applied on top of light repair)
 *
 * Returns the parsed value or throws the original error with a helpful
 * preview of where parsing failed.
 */
export function safeParseClaudeJson<T = unknown>(text: string): T {
  // 1. Happy path
  try {
    return JSON.parse(text) as T;
  } catch (err1) {
    // 2. Light repair
    try {
      return JSON.parse(repairLlmJson(text)) as T;
    } catch {
      // 3. Stray-quote repair on top of light repair
      try {
        return JSON.parse(repairLlmJson(escapeStrayQuotesInsideStrings(text))) as T;
      } catch {
        // 4. Truncation repair as last resort
        try {
          const recovered = repairTruncatedJson(text);
          return JSON.parse(
            repairLlmJson(escapeStrayQuotesInsideStrings(recovered)),
          ) as T;
        } catch {
          const msg = err1 instanceof Error ? err1.message : "JSON parse failed";
          const match = /position\s+(\d+)/i.exec(msg);
          if (match) {
            const pos = parseInt(match[1], 10);
            const start = Math.max(0, pos - 80);
            const end = Math.min(text.length, pos + 80);
            const around = text.slice(start, end).replace(/\s+/g, " ").trim();
            throw new Error(
              `${msg} | context near pos ${pos}: "...${around}..."`,
            );
          }
          throw err1;
        }
      }
    }
  }
}

/**
 * Returns true when an Anthropic SDK error is worth retrying. We treat
 * 429 (rate limit), 500/502/503/504 (server), 529 (overloaded), and
 * network / timeout / connection-reset errors as transient. 4xx other
 * than 429 are permanent (bad request, auth, etc.) and bubble up.
 */
function isTransientClaudeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const e = err as Error & { status?: number; type?: string };
  if (e.status !== undefined) {
    if (e.status === 429 || e.status === 529) return true;
    if (e.status >= 500 && e.status < 600) return true;
  }
  const msg = err.message.toLowerCase();
  if (
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("internal server error")
  ) {
    return true;
  }
  return false;
}

const MAX_CLAUDE_RETRIES = 3;
const CLAUDE_BACKOFF_BASE_MS = 2000; // 2s, 4s, 8s

async function callClaudeOnce(
  system: string,
  userMessage: string,
  options: { maxTokens?: number; temperature?: number; expectJson?: boolean },
): Promise<ClaudeCallResult> {
  const { maxTokens = 4000, temperature = 0.7, expectJson = false } = options;

  // Compact JSON envelope. The detailed schema rules (no wrapping, no
  // renaming "content", no "deck"/"subtitle" substitution, etc.) already
  // live in buildSystemPrompt / composeForPost. safeParseClaudeJson handles
  // markdown-fence and stray-quote repair, so we don't need to spell that
  // out either. Keeping this short reduces token cost AND the recognizable
  // network-wide response shape (per the footprint audit).
  const finalSystem = expectJson
    ? `${system}\n\nOUTPUT: Return ONE valid JSON object only. Escape every \\" inside HTML attribute values. Close every string and the object before hitting the token budget — a shorter complete article beats a truncated long one.`
    : system;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: finalSystem,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content");
  }

  const rawText = block.text;
  // Always extract the JSON object when caller expects JSON. The previous
  // implementation only stripped when text didn't start with `{`, missing
  // cases where Claude wrapped output in markdown fences but the first
  // non-whitespace char appeared to be `{` (or vice versa).
  const text = expectJson ? extractJsonObject(rawText) : rawText.trim();

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Public Claude wrapper with automatic retry on transient errors. Each
 * generation in this app makes 2-3 Claude calls (article, scene summary,
 * analysis); when scaling to thousands of blogs/day the network will hit
 * occasional 429s and 529 (overloaded). Without retry every transient
 * blip turned into a failed post.
 *
 * Retry budget: up to MAX_CLAUDE_RETRIES additional attempts with
 * exponential backoff (2s, 4s, 8s). Total worst-case wait: 14s + 3 calls.
 */
async function callClaude(
  system: string,
  userMessage: string,
  options: { maxTokens?: number; temperature?: number; expectJson?: boolean } = {},
): Promise<ClaudeCallResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_CLAUDE_RETRIES; attempt++) {
    try {
      return await callClaudeOnce(system, userMessage, options);
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_CLAUDE_RETRIES) break;
      if (!isTransientClaudeError(err)) break;
      const delayMs = CLAUDE_BACKOFF_BASE_MS * Math.pow(2, attempt);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[claude] Transient error (attempt ${attempt + 1}/${MAX_CLAUDE_RETRIES + 1}), retrying in ${delayMs}ms: ${msg.slice(0, 200)}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function calcCost(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * PRICING.inputPerToken + outputTokens * PRICING.outputPerToken
  );
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function convertMarkdownToHtml(content: string): string {
  return content
    .replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");
}

function sanitizeMetadata(html: string): string {
  return html
    .replace(/<p>\s*Created:\s*.+?<\/p>/gi, "")
    .replace(/<p>\s*Niche:\s*.+?<\/p>/gi, "")
    .replace(/<p>\s*Keywords?:\s*.+?<\/p>/gi, "")
    .replace(/<p>\s*<em>Discover\s+.+?<\/em>\s*<\/p>/gi, "")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Strip any Claude-emitted image tags (they'd have placeholder or hallucinated
 * URLs that 404). We attach a real hero image as a featured image at publish
 * time instead.
 */
function stripClaudeImages(html: string): string {
  return html
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, "")
    .replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, "")
    .replace(/<img\b[^>]*\/?>/gi, "")
    .replace(/<source\b[^>]*\/?>/gi, "")
    .replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Soft word-count enforcement: if Claude ignored the upper bound, trim down to
 * the last word that still fits within MAX_WORDS. We never pad shorts — that's
 * the prompt's job.
 */
function capWordCount(html: string, max: number): string {
  const words = html.split(/(\s+)/);
  let count = 0;
  let i = 0;
  for (; i < words.length; i++) {
    if (words[i].trim()) {
      count++;
      if (count > max) break;
    }
  }
  if (count <= max) return html;
  const truncated = words.slice(0, i).join("");
  const openTags = (truncated.match(/<p>/gi) || []).length;
  const closeTags = (truncated.match(/<\/p>/gi) || []).length;
  return openTags > closeTags ? truncated + "</p>" : truncated;
}

function countWordsInHtml(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").filter((w) => w.length > 0).length : 0;
}

function generateExcerpt(content: string): string {
  const text = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 160 ? text.substring(0, 157) + "..." : text;
}

// Hero-image URL generation lives in image-generator.ts. The composer here
// also runs a small Claude call (summarizeArticleAsScene below) that turns
// the freshly-written article body into a concrete photographic scene
// description, which then gets passed to the image model as a customPrompt.
// This is what makes the hero image actually match the post's topic instead
// of falling back to whatever generic visual theme the style profile has.

/**
 * Use Claude to convert an article into a single-sentence photographic scene
 * description suitable for Nano Banana / Imagen. The call is small (~200
 * output tokens) and adds ~2-4s and ~$0.001 to total generation cost. In
 * exchange, the image becomes content-aware instead of theme-locked.
 *
 * Returns null on any failure so the caller falls back to the static
 * scene-builder in image-generator.buildImagePrompt().
 */
async function summarizeArticleAsScene(
  title: string,
  bodyHtml: string,
  keywords: string[],
): Promise<string | null> {
  // Strip HTML and take the first ~2000 chars — enough to identify the
  // article's actual subject without paying for the whole body's tokens.
  const plain = bodyHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);

  const system = `You write image-generation prompts for editorial documentary photography. Given an article, you describe ONE concrete photographic scene that would accompany it as a hero image.

Constraints — every prompt MUST:
- Name a specific, real-world physical environment (clinic interior, gym, lab bench, bedroom, kitchen counter, mountain trail, etc.)
- Name specific concrete objects in the frame (not abstract concepts)
- Specify lighting (window light, golden hour, overhead industrial, moonlight, etc.)
- Specify camera angle / composition (low angle, overhead flat-lay, macro close-up, wide shot, etc.)

Constraints — every prompt MUST NOT include:
- Bottles, vials, jars, ampoules, syringes, pills, or pharmaceutical packaging
- Shelves with bottles arranged on them
- Skincare flat-lays or "wellness aesthetic" still lifes
- Identifiable human faces
- Text, labels, logos, or watermarks
- Words like "wellness", "luxury", "premium", or "boutique"

The scene MUST visually evoke the article's actual subject matter and stay strictly within its niche. Examples:
- ligament repair / recovery → a physiotherapy rehab clinic with a treatment bench
- growth hormone / performance → a strength-training gym, loaded barbell
- sleep / circadian → a bedroom at night, moonlight through curtains
- gym opening / membership → a new fitness facility interior, cardio + weight equipment, sign-up desk
- roofing → a residential roof mid-replacement, shingles, ladder, roofing tools
- tax law / IRS / Revenu Québec → a law office desk with legal code books and tax documents
- pest control → a technician's sprayer + inspection flashlight on a home floor, baseboard visible
- charity / nonprofit → a community food-bank sorting table stacked with donations

Never drift to an unrelated domain. A gym article must NOT show a lab; a roofing article must NOT show an office; a tax article must NOT show a gym.

Output: ONE sentence, 25-60 words, describing the scene. Plain text only. No quotes, no preamble.`;

  const user = `ARTICLE TITLE: ${title}

KEYWORDS: ${keywords.slice(0, 8).join(", ")}

ARTICLE EXCERPT (first ~2000 chars):
${plain}

Describe the photographic scene for the hero image.`;

  try {
    const { text } = await callClaude(system, user, {
      maxTokens: 200,
      temperature: 0.8,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    if (cleaned.length < 20 || cleaned.length > 600) return null;
    return cleaned;
  } catch (err) {
    console.warn("[content-generator] Scene summarization failed:", err);
    return null;
  }
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function getNicheRequirements(niche: string): string {
  const key = normalizeNicheKey(niche) ?? "";
  const requirements: Record<string, string> = {
    peptides: `Reference actual published studies. Use proper terminology with explanations. Cite dosage ranges from research, not anecdotes. Acknowledge limitations and unknowns. Distinguish between animal studies, human trials, and theoretical applications. Include medical disclaimers. Never recommend sources or suppliers. Be clear about regulatory status.`,
    gambling: `Use real odds examples and specific numbers. Reference statistical concepts accurately (EV, variance, ROI, CLV). Acknowledge most bettors lose long-term. Include responsible gambling framework naturally. Never promote betting as guaranteed income. Quantify when possible.`,
    web_dev: `Reference actual tools and versions (React 18, Node 20 LTS). Address real trade-offs. Include both happy path and common issues. Compare modern vs legacy approaches honestly. Mention browser compatibility when relevant.`,
    payment_processing: `Use correct terminology (interchange, acquirer, PSP, basis points). Cite actual fee structures with real numbers. Include hidden fees and contract terms. Address compliance requirements (PCI DSS). Acknowledge regional regulatory differences.`,
    loans: `Use correct financial terminology (APR, LTV, DTI). Show total cost of loan, not just monthly payment. Address predatory lending red flags. Include qualification requirements honestly. Distinguish between loan types and their implications.`,
    construction: `Use correct construction terminology (GC, sub, bid process). Include real cost ranges by project scale. Reference regulatory requirements (permits, OSHA, prevailing wage). Acknowledge regional differences. Address business-side concerns (cash flow, payment terms).`,
    reputation_sites: `Reference actual platforms (Trustpilot, Yelp, Google Reviews, BBB, G2). Address both business and consumer viewpoints. Never promote fake review services or manipulation. Distinguish authentic reviews from suspicious patterns. Focus on ethical response strategies.`,
    apps_marketing: `Include actual pricing and version numbers. Acknowledge platform differences (iOS vs Android). Mention real limitations and bugs honestly. Reference actual user feedback. Compare based on what people care about: speed, reliability, cost, privacy.`,
    exclusive_models: `Frame as creator entrepreneurship, not explicit content. Focus on marketing, monetization, branding. Include real platform fees and earnings ranges. Respect creator autonomy. Address platform risks honestly. Never overpromise income potential.`,
    ecom_nails: `Use correct product terminology (gel polish vs builder gel). Reference actual brands with real prices. Include timing (cure times, wear duration). Describe looks specifically with shade names and finish types. Address nail health honestly.`,
    soccer_jersey: `Distinguish authentic vs replica vs counterfeit. Reference actual manufacturers (Nike, Adidas, Puma). Use proper terminology (kit, strip, home/away/third). Address sizing by manufacturer. Never promote counterfeit sources.`,
    app_dev: `Distinguish native (Swift/Kotlin), cross-platform (React Native/Flutter), hybrid. Include realistic cost ranges and timelines. Cover iOS and Android considerations. Address ongoing costs (hosting, APIs, maintenance). Acknowledge market saturation.`,
    tax_lawyer: `Cite specific IRC sections and real penalty amounts. Use concrete dollar figures and timelines (e.g. "10-year CSED on tax debt"). Distinguish federal vs state procedures. Always include a "general information, not legal advice — consult a licensed attorney for your situation" disclaimer. Address common myths honestly (e.g. pennies-on-the-dollar OIC marketing claims).`,
    charity: `Reference actual 501(c)(3) compliance requirements and IRS Form 990 specifics. Use real benchmarks for overhead ratios, donor retention rates, and grant award sizes. Cite specific grant databases (Candid, Grants.gov). Distinguish program vs administrative vs fundraising expenses. Acknowledge sector-wide challenges (donor fatigue, restricted funding) honestly.`,
    pest_extermination: `Use correct entomological names (German vs American cockroach, Eastern vs Western subterranean termite). Reference actual products and active ingredients (fipronil in Termidor, indoxacarb in Advion). Distinguish DIY-feasible vs licensed-only treatments. Address pet and child safety explicitly. Include realistic timelines (bed bug eradication takes 2-3 treatments over 4-6 weeks).`,
    roofing: `Distinguish material types with real per-square cost ranges (asphalt $350-550, metal $900-1400, tile $1000-1800). Reference manufacturer warranties (GAF, Owens Corning, CertainTeed) honestly including pro-rated vs non-prorated terms. Address regional climate factors (snow load, hurricane straps, hail belts). Walk through insurance claim process realistically — what insurers cover vs deny.`,
    gym_subscription: `Use actual chain pricing (Planet Fitness $15/$25 tiers, Equinox $200-$300, LA Fitness ~$30). Address contract gotchas (annual fees, cancellation requirements, auto-renewal). Distinguish big-box vs boutique vs class-based models honestly. Include realistic personal training costs ($60-150/session). Address common frustrations (overcrowding, equipment availability, cancellation friction).`,
    gym_franchise: `Focus on NEW gym launches and franchise openings — NOT ongoing membership comparison (that's the gym_subscription niche). Cover ribbon-cutting dates, the franchise owner's background, equipment partners, opening-day promotions (first-month-free deals, founder discounts), location-specific build-out timing, and how this opening fits the local fitness scene. Name specific local chains by their real names — in Quebec: Énergie Cardio, Éconofitness, Nautilus Plus, Buzzfit, World Gym. Distinguish franchise vs corporate vs independent operations. When local news headlines about gym openings or industry shifts are provided in the prompt, cite them as inline links — this niche lives or dies on locally relevant news context.`,
  };
  return requirements[key] || "";
}

/**
 * Resolve a vertical's language setting into the CONCRETE language for
 * a single post.
 *
 *   "fr"    → always French
 *   "en"    → always English
 *   "en_fr" → bilingual vertical: pick ONE language per post (50/50
 *             coin flip). Each post is cleanly single-language; over
 *             many posts the blog accumulates both — which is what
 *             "bilingual" means for SEO (NOT mixing both in one post).
 *
 * Call this ONCE per generation at the action layer, then pass the
 * resolved value to BOTH ideateTopic and generateContent so the topic
 * and the article are in the same language.
 */
export function resolvePostLanguage(
  language: "en" | "fr" | "en_fr" | null | undefined,
): "en" | "fr" {
  if (language === "fr") return "fr";
  if (language === "en_fr") return Math.random() < 0.5 ? "fr" : "en";
  return "en";
}

/**
 * Estimated cost (USD) for ONE Gemini image generation, based on the
 * configured GOOGLE_IMAGE_MODEL. Used by the per-post cost log — the
 * actual image cost isn't tracked through the publish pipeline (Gemini's
 * REST API doesn't return a billable-token count), so this is a heuristic
 * keyed off the model id we know we asked for. Pricing source:
 * https://ai.google.dev/pricing (verify before relying on cost reporting).
 */
const IMAGE_COST_USD: Record<string, number> = {
  "gemini-3-pro-image-preview": 0.13,
  "gemini-3-flash-image-preview": 0.04,
  "gemini-2.5-flash-image": 0.04,
};

export function estimateImageCostUsd(): number {
  const model = process.env.GOOGLE_IMAGE_MODEL || "gemini-3-flash-image-preview";
  return IMAGE_COST_USD[model] ?? 0.04;
}

/**
 * TLD-aware language resolution. Operator policy:
 *
 *   .com  → English ONLY, regardless of vertical config. .com sites
 *           target the US / international audience; we never write
 *           French for them even if the vertical is bilingual.
 *   .ca   → use the vertical's configured language (calls
 *           resolvePostLanguage). For bilingual (en_fr) verticals this
 *           coin-flips per post — English on some posts, French on
 *           others, never mixed within a single post.
 *   other → same as .ca (fall through to resolvePostLanguage).
 *
 * Domain is matched case-insensitively against the last dot segment so
 * "Example.COM", "blog.example.com", and "example.com" all behave the
 * same. Protocol / path noise is stripped before matching.
 */
export function postLanguageForDomain(
  verticalLanguage: "en" | "fr" | "en_fr" | null | undefined,
  domain: string,
): "en" | "fr" {
  const cleanDomain = (domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/:\d+$/, "");
  if (cleanDomain.endsWith(".com")) {
    return "en";
  }
  return resolvePostLanguage(verticalLanguage);
}

/**
 * Build a language directive appended to the system prompt. Empty for
 * English. For French it forces the ENTIRE JSON payload — title,
 * content, excerpt, metaTitle, metaDescription, keywords — into Québec
 * French. Callers should resolve "en_fr" to a concrete "en"/"fr" via
 * resolvePostLanguage() before this is reached.
 */
function buildLanguageDirective(
  language: GenerateOptions["language"],
): string {
  if (language === "fr") {
    return `

LANGUE / LANGUAGE — CRITICAL:
- Write the ENTIRE article in FRENCH (français). This is a French-
  language blog for a Québec audience.
- Every JSON field must be in French: "title", "content", "excerpt",
  "metaTitle", "metaDescription", AND the "keywords" array.
- Use natural Québec French phrasing and vocabulary, not literal
  English-to-French translation. Prices in CAD ($), dates in French
  format, French punctuation conventions.
- Industry/brand/technical terms with no common French equivalent may
  stay in English (e.g. product names, "GLP-1", "shingles"), but the
  surrounding sentence MUST be French.
- Do NOT write whole sentences or paragraphs in English.`;
  }
  // "en", "en_fr" (should have been resolved already), or undefined →
  // English, no directive.
  return "";
}

// ─── Per-blog stylistic seeding (legacy / non-profile path) ─────────────────
//
// Same blog → same picks every time. Lets the legacy path approach the
// profile-path's per-blog diversification without the full composer stack.
// Per the footprint audit: shared voice fingerprint across a niche is the
// easiest network pattern for a classifier to find — these helpers break it.

const QUIRK_POOL: string[] = [
  "Occasionally drop a single-sentence paragraph for emphasis (max 2–3 per article).",
  "Use parentheticals (like this one) more than average — 3–5 per article.",
  "Open roughly 30% of paragraphs with a question.",
  "Use heavy parallel construction in some sections, then deliberately break it elsewhere.",
  "Prefer numerals (3) over spelled-out numbers (three), even at sentence starts.",
  "Use specific timeframes frequently: 'in 2014,' 'by 2019,' 'as of late 2022.'",
  "Mid-paragraph self-correction: 'Actually, that's imprecise — more accurately...'",
  "Use sentence fragments for emphasis. Sparingly. Like this.",
  "Prefer 'Note that...' or 'Consider...' as section openers in technical passages.",
  "Use first-person plural ('we') rather than second-person ('you') when explaining concepts.",
  "Avoid the colon-before-list pattern. Lead with a sentence ending in a period.",
  "Use 'I' once or twice per article to inject authorial voice — sparingly.",
];

/** Small deterministic 32-bit hash of a string. Stable across processes. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick `count` distinct quirks from QUIRK_POOL deterministically by seed. */
function pickQuirks(seed: string | undefined, count = 2): string[] {
  if (!seed) return [];
  const base = hashSeed(seed);
  const picks: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    let idx = (base + i * 31) % QUIRK_POOL.length;
    // De-collision: walk forward until we find an unused slot.
    while (used.has(idx)) idx = (idx + 1) % QUIRK_POOL.length;
    used.add(idx);
    picks.push(QUIRK_POOL[idx]);
  }
  return picks;
}

/**
 * Per-blog word band drawn from inside the network bounds
 * [GLOBAL_WORD_BAND_MIN, GLOBAL_WORD_BAND_MAX]. Each blog gets a stable
 * (~300-word-wide) sub-range so the network doesn't cluster on uniform
 * word counts. Falls back to the network bounds when no seed is provided.
 */
function wordBandForBlog(
  seed: string | undefined,
  requestedTarget: number,
): { min: number; max: number; target: number } {
  const lo = MIN_WORDS;
  const hi = MAX_WORDS;
  if (!seed) {
    const target = Math.max(lo, Math.min(hi, requestedTarget));
    return { min: lo, max: hi, target };
  }
  const span = hi - lo; // e.g. 700
  const bandWidth = Math.max(250, Math.round(span * 0.35)); // ~245+
  const h = hashSeed(seed);
  // Deterministic start offset such that [start, start + bandWidth] ⊆ [lo, hi].
  const start = lo + (h % Math.max(1, span - bandWidth));
  const min = start;
  const max = start + bandWidth;
  const target = Math.round((min + max) / 2);
  return { min, max, target };
}

/**
 * Per-blog body-image wrapper class (used by embedBodyImage). Different
 * sites should emit different markup; identical class names across the
 * network are a trivial HTML fingerprint per the audit.
 */
function bodyImageClassForBlog(seed: string | undefined): string {
  const POOL = [
    "post-figure",
    "inline-illustration",
    "article-figure",
    "story-image",
    "post-illustration",
    "body-figure",
    "feature-image",
    "content-figure",
  ];
  if (!seed) return POOL[0];
  return POOL[hashSeed(seed) % POOL.length];
}

function buildSystemPrompt(opts: GenerateOptions): string {
  const niche = getNicheContext(opts.niche);
  const brandVoice = opts.brandVoice || niche.defaultBrandVoice;
  const audience = opts.targetAudience || niche.defaultAudience;
  // Per-blog word band — same seed → same band always. The opts.wordCount
  // is treated as a hint; the per-blog band overrides it so the network
  // doesn't cluster on a uniform target.
  const wb = wordBandForBlog(opts.blogSeed, opts.wordCount);
  const targetWords = wb.target;
  // Per-blog stylistic tics — picked deterministically from QUIRK_POOL by
  // blogSeed. Same blog always writes with the same 2 quirks.
  const quirks = pickQuirks(opts.blogSeed, 2);

  let prompt = `You are an expert content writer in the ${niche.industry} space. Write a comprehensive, original article that reads like it was written by someone with deep first-hand experience.

VOICE & STYLE:
- Brand voice: ${brandVoice}
- Audience: ${audience}
- Tone: ${opts.tone}
- Style: ${niche.contentStyle}

QUALITY BAR:
- Specific over generic — exact prices, real brand/tool names, concrete numbers
- Show your reasoning, don't just assert
- Include trade-offs and limitations honestly, not just upsides

FORBIDDEN AI TELLS (will cause the post to be rejected):

Punctuation:
- NEVER use em-dashes (—) or en-dashes (–) as pause markers. Replace with periods, commas, or sentence breaks.
- NEVER use the single-character ellipsis (…). Use three periods (...).
- NEVER use curly/smart quotes (" " ' '). Use straight quotes (" and ').

Forbidden vocabulary (do not appear in any context):
delve, tapestry, realm, ecosystem (as metaphor), landscape (as metaphor), journey (as metaphor), navigate (as metaphor), unleash, harness, foster, cultivate, embark, robust, seamless, holistic, nuanced, paradigm, multifaceted, intricate, pivotal, plethora, myriad, gleaned, meticulous, underscore, bolster, garner.

Forbidden phrases (never include any of these):
- "It's not just X, it's Y"
- "Whether you're X or Y..."
- "In today's [world / fast-paced / digital / modern]..."
- "Game-changer", "Revolutionary", "Transformative"
- "It's worth noting that"
- "That said," / "With that in mind"
- "Look no further" / "Without further ado"
- "When it comes to"
- "Let's dive in" / "Let's explore"
- "At its core"
- Sentence-initial: "Ultimately," / "Fundamentally," / "Essentially,"
- "The key takeaway"
- Sign-off lines like "Happy [verbing]!"
- Filler transitions: "Moreover," "Furthermore," "In conclusion"

Forbidden structural patterns:
- Do NOT make every paragraph exactly 3 or 4 sentences. Vary paragraph length deliberately: some single-sentence paragraphs for emphasis, some 5–7 sentence paragraphs, some short.
- Do NOT use perfect parallel structure in every list. Real writers break parallelism naturally.
- Do NOT open with a time-anchored cliché ("In today's...", "In an era of...").
- Do NOT close with "In conclusion" or a recap paragraph.

CADENCE TARGET:
- Average sentence length: 15–20 words.
- HIGH variance: include at least 3–5 sentences under 10 words AND at least 2–3 sentences over 25 words.
- Paragraphs vary between 1 and 7 sentences.

WORD COUNT (HARD LIMITS):
- Minimum ${wb.min} words — anything shorter will be rejected.
- Maximum ${wb.max} words — leave a 200–300-word buffer below the maximum so the JSON can't be truncated mid-string.
- Target approximately ${targetWords} words.
- Depth over padding; trim ruthlessly before approaching the cap.

IMAGES:
- Do NOT include any <img>, <figure>, <picture>, or <figcaption> tags in your output. A hero image is attached as the article's featured image at publish time — any inline images you emit will be stripped.

STRUCTURE:
- Open with a substantive hook (no time-anchored opener).
- Use <h2> for major sections, <h3> for subsections.
- Lists where useful, not where padding.
- Close with concrete takeaways, not platitudes.

OUTPUT FORMAT:
Return ONLY valid JSON with EXACTLY these top-level keys:
{
  "title": "Title under 60 characters with primary keyword",
  "content": "Full HTML article between ${wb.min} and ${wb.max} words",
  "excerpt": "150-160 character summary",
  "metaTitle": "SEO title under 60 characters",
  "metaDescription": "150-160 character meta description",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

JSON SHAPE — strict:
- "content" is ONE HTML string. Do not split into "intro"/"items"/"sections"/"paragraphs"/"deck"/"body"+"conclusion". Build one HTML string.
- Do not wrap the response in another object ({"article": ...}). Return the JSON directly.
- Use field names exactly as shown ("content" not "html"/"body"/"article_html"; "title" not "headline"/"post_title").
- Allowed tags in "content": <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a>. No images, no markdown headings.`;

  if (quirks.length > 0) {
    prompt += `\n\nTHIS BLOG'S WRITING HABITS (apply consistently across the article):\n${quirks.map((q) => `- ${q}`).join("\n")}`;
  }

  const nicheReqs = opts.niche ? getNicheRequirements(opts.niche) : "";
  if (nicheReqs) {
    prompt += `\n\nNICHE-SPECIFIC REQUIREMENTS:\n${nicheReqs}`;
  }

  // SEO REQUIREMENTS block removed per the footprint audit (insight 2):
  // "Natural keyword density 1-2%" / "primary keyword in first 100 words"
  // optimize to exactly what classifiers fingerprint. The structure rules
  // above are enough; entity coverage + uniqueness is the right replacement
  // (separate follow-up). Keeping seoOptimized for back-compat / future use.
  if (opts.seoOptimized) {
    // Intentionally a no-op for now — see comment above.
  }

  return prompt;
}

function buildUserPrompt(opts: GenerateOptions): string {
  return `Write the article.

Topic: ${opts.topic}
Target keywords: ${opts.keywords.join(", ") || "(infer from topic)"}

Begin now. Return only the JSON object.`;
}

// ─── Topic ideation (used by cron auto-publish) ─────────────────────────────

export async function ideateTopic(
  niche: string | null | undefined,
  recentTitles: string[],
  opts: {
    verticalKey?: string | null;
    /**
     * Per-blog locked style profile. When provided, the topic ideation
     * anchors on this blog's UNIQUE primaryCompounds and locked
     * sub-niche instead of the niche's generic keyTopics list. Without
     * this, every blog's first post (no recent titles) defaulted to
     * the first compound in keyTopics (BPC-157 for peptides) — every
     * peptide blog ended up starting with the same topic.
     */
    styleProfile?: StyleProfile;
    /** Output language — French verticals get French topics + keywords. */
    language?: "en" | "fr" | "en_fr";
  } = {},
): Promise<{ topic: string; keywords: string[] }> {
  const ctx = getNicheContext(niche);
  const recentList = recentTitles.length
    ? recentTitles.slice(0, 20).map((t) => `- ${t}`).join("\n")
    : "(none yet — first post for this blog)";

  // Pull recent news headlines for this vertical (if registered + has
  // cached items). Cron `/api/cron/refresh-news` keeps the cache fresh
  // daily. Returns empty string when no vertical or no items — ideation
  // falls back to its cold-start behavior.
  let newsBlock = "";
  if (opts.verticalKey) {
    try {
      const items = await takeNewsContextForVertical(opts.verticalKey, 6);
      if (items.length > 0) {
        newsBlock = await formatNewsContextForPrompt(items);
      }
    } catch (err) {
      // Non-fatal — ideation should still produce a topic even if the
      // news lookup or marking fails.
      console.warn(
        "[ideateTopic] news context lookup failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const newsClause = newsBlock
    ? `- Tie the topic to a current news angle when one of the recent headlines fits naturally\n- Skip the news angle entirely if no headline relates to the niche`
    : "";

  // Profile-aware focus anchor. When a style profile is present, force
  // the topic to center on this blog's UNIQUE primary/secondary
  // compounds and locked sub-niche. This is what makes each peptide
  // blog's first post unique — the random assignment algorithm gave
  // every blog a different 2-compound primary canon, so anchoring
  // ideation on those compounds guarantees blog-level uniqueness even
  // when recentTitles is empty.
  //
  // When no profile (non-peptide blogs), fall back to the niche's
  // generic keyTopics list.
  let focusLine: string;
  let profileAnchorSection = "";
  if (opts.styleProfile) {
    const sp = opts.styleProfile;
    const subNiche = SUB_NICHES[sp.subNicheId];
    const subNicheName = subNiche?.name ?? "general";
    const primary = sp.primaryCompounds.length
      ? sp.primaryCompounds.join(", ")
      : "(none specified)";
    const secondary = sp.secondaryCompounds.length
      ? sp.secondaryCompounds.join(", ")
      : "(none specified)";

    focusLine =
      `- Anchor the topic on ONE of THIS BLOG'S primary compounds: ${primary}\n` +
      `- Stay strictly within the "${subNicheName}" sub-niche\n` +
      `- Secondary compounds available for comparison/stack context: ${secondary}`;

    profileAnchorSection =
      `\n\nBLOG-SPECIFIC CANON (this blog's locked profile — DO NOT drift):\n` +
      `  sub-niche: ${subNicheName}\n` +
      `  primary compounds: ${primary}\n` +
      `  secondary compounds: ${secondary}\n` +
      `Every peptide blog in this network has a different primary-compound\n` +
      `pair, which is what makes each site unique. The topic you suggest\n` +
      `MUST center on one of the two primary compounds above — do not\n` +
      `default to BPC-157 / TB-500 / semaglutide unless those are in the\n` +
      `primary list. Picking a compound outside this canon breaks the\n` +
      `network's per-blog distinctiveness.`;
  } else if (ctx.keyTopics.length > 0) {
    focusLine = `- Cover the niche's key topics: ${ctx.keyTopics.join(", ")}`;
  } else {
    focusLine = `- Stay tightly focused on the ${ctx.label} niche — do not drift into adjacent industries`;
  }

  const languageClause =
    opts.language === "fr"
      ? `\n- Write the "topic" AND every "keywords" entry in FRENCH (français), Québec phrasing — this is a French-language blog`
      : "";

  const system = `You generate fresh blog post topic ideas for a ${ctx.industry} niche site (${ctx.label}). Suggest topics that:
${focusLine}
- Do NOT overlap with recent titles
- Have clear search intent
- Are specific (not generic listicles)${languageClause}
${newsClause}

Return JSON only:
{ "topic": "Specific topic for the article", "keywords": ["kw1", "kw2", "kw3"] }`;

  const newsSection = newsBlock
    ? `\n\nRecent news headlines relevant to this vertical (last 72 hours):\n${newsBlock}`
    : "";

  const user = `Recent titles on this site (avoid duplicating these):
${recentList}${profileAnchorSection}${newsSection}

Suggest the next post's topic.`;

  const { text } = await callClaude(system, user, {
    maxTokens: 300,
    temperature: 0.9,
    expectJson: true,
  });

  try {
    const parsed = safeParseClaudeJson<{ topic?: unknown; keywords?: unknown }>(text);
    return {
      topic: String(parsed.topic || "").slice(0, 500),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse error";
    throw new Error(
      `Topic ideation returned invalid JSON: ${msg} | response preview: ${text.slice(0, 200)}`,
    );
  }
}

// ─── Analysis (combined SEO/readability/brand voice) ────────────────────────

interface AnalysisOutcome {
  scores: AnalysisScores;
  inputTokens: number;
  outputTokens: number;
}

async function analyzeContent(
  content: string,
  title: string,
  opts: GenerateOptions,
): Promise<AnalysisOutcome> {
  const truncated = content.length > 3000 ? content.substring(0, 3000) + "..." : content;
  const scores: AnalysisScores = { seoScore: 60, readabilityScore: 65, brandVoiceScore: 65 };

  const system = `You evaluate written content on three dimensions and return numeric scores 1-100.

SEO SCORE (1-100):
- Primary keyword in title, first paragraph, headings
- Natural keyword density 1-3%
- Heading hierarchy and content structure
- Search intent alignment
- Title length under 60 chars; meta description 150-160 chars

READABILITY SCORE (1-100):
- Average sentence length under 20 words
- Sentence length variety
- Active voice
- Clear paragraph structure and transitions
- Vocabulary appropriate to audience

BRAND VOICE SCORE (1-100):
- Maintains specified tone throughout
- Word choice matches brand voice
- Audience appropriateness
- Authority level matches positioning

Return ONLY JSON: { "seoScore": number, "readabilityScore": number, "brandVoiceScore": number }`;

  const user = `Evaluate this content.

TITLE: ${title}
TARGET KEYWORDS: ${opts.keywords.join(", ")}
SPECIFIED TONE: ${opts.tone}
BRAND VOICE: ${opts.brandVoice || "(use tone)"}
TARGET AUDIENCE: ${opts.targetAudience || "general audience"}

CONTENT:
${truncated}`;

  try {
    const { text, inputTokens, outputTokens } = await callClaude(system, user, {
      maxTokens: 200,
      temperature: 0.1,
      expectJson: true,
    });
    const parsed = safeParseClaudeJson<{
      seoScore?: number;
      readabilityScore?: number;
      brandVoiceScore?: number;
    }>(text);
    if (typeof parsed.seoScore === "number") {
      scores.seoScore = Math.max(1, Math.min(100, Math.round(parsed.seoScore)));
    }
    if (typeof parsed.readabilityScore === "number") {
      scores.readabilityScore = Math.max(1, Math.min(100, Math.round(parsed.readabilityScore)));
    }
    if (typeof parsed.brandVoiceScore === "number") {
      scores.brandVoiceScore = Math.max(1, Math.min(100, Math.round(parsed.brandVoiceScore)));
    }
    return { scores, inputTokens, outputTokens };
  } catch (err) {
    console.warn("Content analysis failed, using fallback scores:", err);
    return { scores, inputTokens: 0, outputTokens: 0 };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function generateContent(opts: GenerateOptions): Promise<GenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  // Branch on whether the blog has a locked style profile.
  //   - With profile (peptide blogs): use skeleton-composer + profile-aware scrubber
  //   - Without profile (other niches): use the existing niche-based prompt +
  //     scrubber-lite (punctuation + AI-tells, no compliance enforcement)
  const usingProfile = Boolean(opts.styleProfile);

  // External-link news references — non-peptide blogs only. Pulls
  // recent items from the news_items cache for the blog's vertical and
  // formats them as a reference list Claude can inline as <a href>
  // links. Peptide blogs intentionally skip outbound news links for
  // compliance posture (we don't want to look like we're endorsing
  // third-party clinical claims by linking to news articles about
  // peptides).
  const nicheNormalized = normalizeNicheKey(opts.niche);
  const allowExternalNewsLinks =
    nicheNormalized !== "peptides" && Boolean(opts.verticalKey);
  let newsLinksClause = "";
  if (allowExternalNewsLinks) {
    try {
      const items = await getRecentNewsForVerticalInternal(
        opts.verticalKey ?? null,
        6,
      );
      if (items.length > 0) {
        const refList = items
          .map((it, i) => {
            const pub = it.publisher ? ` — ${it.publisher}` : "";
            return `[${i + 1}] "${it.title}"${pub}\n    ${it.link}`;
          })
          .join("\n");
        newsLinksClause =
          `\n\nEXTERNAL NEWS REFERENCES (use 1-3 as inline <a href> links where they fit the topic):\n` +
          `${refList}\n\n` +
          `LINKING RULES:\n` +
          `- Pick 1-3 of the above whose headline genuinely relates to a point you're making.\n` +
          `- Use HTML <a href="URL" target="_blank" rel="noopener nofollow">descriptive anchor text</a>.\n` +
          `- Anchor text should describe what the reader is clicking to, NOT raw URLs or "click here".\n` +
          `- If none of the references fits naturally, do NOT force a link — quality over count.\n` +
          `- Never include all 6; keep external link count to 3 max.`;
      }
    } catch (err) {
      console.warn(
        "[content-generator] news-links lookup failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Internal-link references — recent sibling posts on the SAME blog.
  // Pre-fetched by the caller (see content-generation-actions.ts). Claude
  // weaves 2–4 of them in as inline <a href> anchors. Per the footprint
  // audit, internal link architecture is the single biggest SEO signal
  // we were leaving on the table; sibling links also raise time-on-site,
  // which is an actual ranking input.
  let internalLinksClause = "";
  const refs = opts.internalLinkRefs ?? [];
  if (refs.length > 0) {
    const refList = refs
      .slice(0, 8)
      .map((it, i) => `[${i + 1}] "${it.title}"\n    ${it.url}`)
      .join("\n");
    internalLinksClause =
      `\n\nINTERNAL LINKS — recent posts on THIS site (weave 2–4 in as inline anchors):\n` +
      `${refList}\n\n` +
      `INTERNAL LINKING RULES:\n` +
      `- Pick 2–4 of the above whose topic genuinely relates to what this article is about.\n` +
      `- Use HTML <a href="URL">descriptive anchor text</a> — no target/rel attributes (these are same-site).\n` +
      `- Anchor text must describe the linked article's subject, never "click here" / "this post" / raw URLs.\n` +
      `- Place internal links inside sentences where the reader would actually click for more — not in a "related posts" footer.\n` +
      `- Do NOT exceed 4 internal links.`;
  }

  // Language directive — appended to the system prompt so French
  // verticals (gym, roofing, tax lawyer, pest) generate French content
  // and the title / excerpt / meta fields come back in French too.
  const languageDirective = buildLanguageDirective(opts.language);

  let system: string;
  let user: string;
  let maxTokens: number;
  if (usingProfile && opts.styleProfile) {
    const composed = composeForPost({
      profile: opts.styleProfile,
      topic: opts.topic,
      // For universal-niche profiles, pass the blog's actual niche label
      // (e.g. "gym marketing") so the prompt's {sub_niche} placeholder
      // gets a topical value instead of the generic "General Content".
      nicheLabel: opts.niche,
    });
    system = composed.systemPrompt + languageDirective;
    user = composed.userPrompt;
    // Append the external-news-links clause (no-op for peptides — they
    // skip this entirely upstream).
    if (newsLinksClause) {
      user = user + newsLinksClause;
    }
    if (internalLinksClause) {
      user = user + internalLinksClause;
    }
    // Profile blogs may target word bands up to 3000 words. Schema C (FAQ-
    // rich) and Schema D (listicle) include extra structured arrays beyond
    // the main content, so we budget generously: ~3.0 tokens/word covers
    // prose + JSON envelope + nested arrays + HTML tags + extra safety
    // margin against unicode-heavy content (peptide compound names, citations
    // with accents, etc. all cost more tokens per char). Cap at 8192 —
    // Sonnet 4.5's max output. The strict word-count directive in the
    // system prompt now also tells Claude to stay under the ceiling rather
    // than hit it exactly, which together with the bigger budget eliminates
    // mid-string truncation for almost all posts.
    maxTokens = Math.min(8192, Math.round(opts.styleProfile.wordBandMax * 3.0));
  } else {
    system = buildSystemPrompt(opts) + languageDirective;
    user = buildUserPrompt(opts);
    if (newsLinksClause) {
      user = user + newsLinksClause;
    }
    if (internalLinksClause) {
      user = user + internalLinksClause;
    }
    maxTokens = 4000;
  }

  // 1. Generate
  const {
    text,
    inputTokens: genInput,
    outputTokens: genOutput,
  } = await callClaude(system, user, {
    maxTokens,
    temperature: 0.7,
    expectJson: true,
  });

  // 2. Parse — safeParseClaudeJson tries direct then repaired (handles
  //    trailing commas, unescaped newlines in content fields, smart quotes,
  //    HTML-attribute stray quotes, truncation).
  let parsed: Partial<GeneratedContent>;
  try {
    parsed = safeParseClaudeJson<Partial<GeneratedContent>>(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse error";
    throw new Error(`Claude returned invalid JSON: ${msg}`);
  }

  // Field-name fallback: Claude occasionally returns the article wrapped
  // in another object ({"article": {...}}) or uses alternate field names
  // ("html" / "body" / "article_html" instead of "content"; "headline" /
  // "post_title" instead of "title"). Unwrap and remap before failing.
  parsed = normalizeArticleShape(parsed);

  if (!parsed.title || !parsed.content) {
    const keys = Object.keys(parsed).join(", ") || "(empty)";
    // Include a short value preview per key so an unseen shape variant
    // is easy to triage from logs. Skip large values to keep the error
    // message under the log truncation limit.
    const preview = Object.entries(parsed)
      .slice(0, 8)
      .map(([k, v]) => {
        if (typeof v === "string") {
          return `${k}=str(${v.length}ch)`;
        }
        if (Array.isArray(v)) {
          return `${k}=arr(${v.length})`;
        }
        if (v && typeof v === "object") {
          return `${k}=obj{${Object.keys(v).slice(0, 4).join(",")}}`;
        }
        return `${k}=${typeof v}`;
      })
      .join(" ");
    throw new Error(
      `Claude response missing required fields (title, content). ` +
        `Returned keys: ${keys}. Shape: ${preview}. ` +
        `Reconstruction did not match any known variant — extend ` +
        `reconstructContentFromParts() in content-generator.ts.`,
    );
  }

  // 3. Format + sanitize, strip any Claude-emitted images (they'd be broken).
  //    Word-count enforcement here is the legacy hard MIN_WORDS check; for
  //    profile blogs the scrubber's Layer 1F handles word-band checks.
  let body = parsed.content;
  if (body.includes("#")) body = convertMarkdownToHtml(body);
  body = sanitizeMetadata(body);
  body = stripClaudeImages(body);

  if (!usingProfile) {
    body = capWordCount(body, MAX_WORDS);
    const wordCount = countWordsInHtml(body);
    if (wordCount < MIN_WORDS) {
      throw new Error(
        `Generated content is ${wordCount} words, below the ${MIN_WORDS}-word minimum`,
      );
    }
  }

  // 4. Scrubber — profile-aware when a profile exists, lite otherwise.
  let scrubberReport: ScrubberReport | undefined;
  let flaggedForReview = false;
  if (usingProfile && opts.styleProfile) {
    const result = runScrubber({
      content: body,
      profile: opts.styleProfile,
    });
    body = result.content;
    scrubberReport = result.report;
    flaggedForReview = result.flaggedForReview;
  } else {
    // Lite path — auto-fix punctuation + log AI-tell hits but don't gate.
    const lite = runScrubberLite(body);
    body = lite.content;
  }

  const wordCount = countWordsInHtml(body);

  // 5. Compute the hero image URL via Google Nano Banana.
  //    Strategy: run a small Claude call to summarize the article body into
  //    a concrete photographic scene description, then pass that to Nano
  //    Banana as a customScene. This makes the image content-aware (the
  //    scene actually matches what THIS article is about) instead of
  //    falling back to the blog's locked sub-niche theme for every post.
  //    Falls back to the static scene builder if the summary call fails.
  //    Output is always a data: URI — Shopify and WordPress decode it
  //    inline at publish time. No fallback provider.
  const imageKeywords =
    parsed.keywords && parsed.keywords.length > 0 ? parsed.keywords : opts.keywords;
  let heroImageUrl: string | undefined;
  let bodyImageUrl: string | undefined;
  let customScene: string | null = null;
  try {
    customScene = await summarizeArticleAsScene(
      parsed.title,
      body,
      imageKeywords,
    );
    if (customScene) {
      console.info(
        `[content-generator] Image scene: "${customScene.slice(0, 100)}${customScene.length > 100 ? "…" : ""}"`,
      );
    }

    const imageInputBase = {
      title: parsed.title,
      keywords: imageKeywords,
      niche: opts.niche,
      subNicheId: opts.styleProfile?.subNicheId,
      primaryCompounds: opts.styleProfile?.primaryCompounds,
      customScene: customScene ?? undefined,
    };

    // Generate hero + body in parallel — they share the same scene but
    // request different framings (wide vs detail), giving the post two
    // visually distinct images for ~2× the latency of one.
    // Either failure is non-fatal: settle so a body-image timeout
    // doesn't drop the hero.
    const [heroResult, bodyResult] = await Promise.allSettled([
      generateHeroImage(imageInputBase),
      generateBodyImage(imageInputBase),
    ]);

    if (heroResult.status === "fulfilled") {
      heroImageUrl = heroResult.value.url;
      console.info(
        `[content-generator] Hero image via ${heroResult.value.model} for "${parsed.title.slice(0, 60)}"`,
      );
    } else {
      console.error(
        "[content-generator] Hero image generation failed:",
        heroResult.reason,
      );
    }

    if (bodyResult.status === "fulfilled") {
      bodyImageUrl = bodyResult.value.url;
      console.info(
        `[content-generator] Body image via ${bodyResult.value.model} for "${parsed.title.slice(0, 60)}"`,
      );
    } else {
      console.error(
        "[content-generator] Body image generation failed:",
        bodyResult.reason,
      );
    }

    // HERO RETRY — the hero is the post's primary image; never ship
    // without one if we can avoid it. If the first attempt failed
    // (transient Google error, or a customScene the safety filter
    // rejected), retry ONCE using the static niche scene instead of
    // the article-derived customScene. The static scenes are
    // pre-vetted and safe-filter-friendly, so this recovers the vast
    // majority of first-attempt failures.
    if (!heroImageUrl) {
      try {
        const retry = await generateHeroImage({
          title: parsed.title,
          keywords: imageKeywords,
          niche: opts.niche,
          subNicheId: opts.styleProfile?.subNicheId,
          primaryCompounds: opts.styleProfile?.primaryCompounds,
          // No customScene → buildImagePrompt uses the static niche
          // scene (SUB_NICHE_VISUALS / FREE_NICHE_VISUALS / default).
        });
        heroImageUrl = retry.url;
        console.info(
          `[content-generator] Hero image RECOVERED on retry (static scene) for "${parsed.title.slice(0, 60)}"`,
        );
      } catch (retryErr) {
        console.error(
          "[content-generator] Hero image retry also failed:",
          retryErr,
        );
      }
    }

    // BODY RETRY — same idea, lower priority. Only retry if the hero
    // succeeded (so we don't double-spend Google calls on a fully-down
    // API). Static scene, body framing.
    if (!bodyImageUrl && heroImageUrl) {
      try {
        const retry = await generateBodyImage({
          title: parsed.title,
          keywords: imageKeywords,
          niche: opts.niche,
          subNicheId: opts.styleProfile?.subNicheId,
          primaryCompounds: opts.styleProfile?.primaryCompounds,
        });
        bodyImageUrl = retry.url;
        console.info(
          `[content-generator] Body image RECOVERED on retry (static scene) for "${parsed.title.slice(0, 60)}"`,
        );
      } catch {
        // Non-fatal — body image is optional.
      }
    }
  } catch (err) {
    // Scene summarizer threw — log and ship without images rather than
    // substituting an unrelated placeholder.
    console.error("[content-generator] Image pipeline failed:", err);
  }

  // Embed the body image into the HTML at roughly the midpoint so it
  // actually appears in the published post. Hero stays as the featured
  // image (rendered above the post by Shopify/WordPress themes).
  if (bodyImageUrl) {
    body = embedBodyImage(body, bodyImageUrl, parsed.title, opts.blogSeed);
  }

  // 6. Scoring removed (per footprint audit insight 2). The old
  //    analyzeContent call cost ~$0.0015/post AND optimized to exactly the
  //    metrics classifiers fingerprint (keyword density 1-3%, primary kw
  //    in first 100w). Replacement is a local uniqueness + fingerprint
  //    check — separate follow-up. Default scores keep the DB schema and
  //    UI happy; they're advisory anyway, never blocking.
  const scores: AnalysisScores = {
    seoScore: 70,
    readabilityScore: 70,
    brandVoiceScore: 70,
  };

  const totalInputTokens = genInput;
  const totalOutputTokens = genOutput;
  const totalTokens = totalInputTokens + totalOutputTokens;
  const costUsd = calcCost(totalInputTokens, totalOutputTokens);

  return {
    title: parsed.title,
    content: body,
    excerpt: parsed.excerpt || generateExcerpt(body),
    metaTitle: parsed.metaTitle || parsed.title,
    metaDescription: parsed.metaDescription || generateExcerpt(body),
    keywords: parsed.keywords && parsed.keywords.length > 0 ? parsed.keywords : opts.keywords,
    wordCount,
    seoScore: scores.seoScore,
    readabilityScore: scores.readabilityScore,
    brandVoiceScore: scores.brandVoiceScore,
    tokensUsed: totalTokens,
    costUsd: Number(costUsd.toFixed(6)),
    heroImageUrl,
    bodyImageUrl,
    scrubberReport,
    flaggedForReview,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Insert the body image into the article HTML at roughly the midpoint.
 *
 * Strategy: split the body on closing </p> tags, walk to the paragraph
 * that crosses the halfway word-count mark, and insert a <figure> with
 * the image right before it. If the body has fewer than 4 paragraphs
 * we fall back to inserting before the last paragraph so the image
 * doesn't end up at the very top or in a one-line stub.
 *
 * Uses a plain alt attribute derived from the post title — the body
 * image content is conceptually the same topic as the hero, so we
 * don't bother generating a separate alt string.
 */
function embedBodyImage(
  html: string,
  dataUri: string,
  title: string,
  blogSeed?: string,
): string {
  const safeAlt = title
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 200);
  // Per-blog wrapper class + style variant so this markup isn't identical
  // across the network (footprint audit #8). Same blog → same markup always.
  const cls = bodyImageClassForBlog(blogSeed);
  // Two style variants picked deterministically so different blogs emit
  // different inline-style strings. Both render identically; only the
  // serialized HTML differs.
  const styleVariant = blogSeed && hashSeed(blogSeed) % 2 === 0
    ? `margin:1.5em 0;`
    : `margin:1.25rem 0 1.75rem;`;
  const imgStyle = blogSeed && (hashSeed(blogSeed) >> 3) % 2 === 0
    ? `width:100%;height:auto;display:block;`
    : `display:block;max-width:100%;height:auto;`;
  const figure =
    `<figure class="${cls}" style="${styleVariant}">` +
    `<img src="${dataUri}" alt="${safeAlt}" loading="lazy" ` +
    `style="${imgStyle}" />` +
    `</figure>`;

  // Split keeping the closing tag attached to each piece.
  const parts = html.split(/(<\/p>)/i);
  // After the split, paragraphs look like [text, "</p>", text, "</p>", ...].
  // Rebuild paragraphs by pairing each text part with its closing tag.
  type Para = { html: string; words: number };
  const paragraphs: Para[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i] ?? "";
    const close = parts[i + 1] ?? "";
    const combined = text + close;
    if (combined.trim().length === 0) continue;
    const words = combined.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length;
    paragraphs.push({ html: combined, words });
  }

  if (paragraphs.length === 0) {
    // No paragraphs — append at end as fallback.
    return html + figure;
  }
  if (paragraphs.length < 4) {
    // Short article — insert before the last paragraph.
    const insertAt = paragraphs.length - 1;
    return (
      paragraphs
        .slice(0, insertAt)
        .map((p) => p.html)
        .join("") +
      figure +
      paragraphs
        .slice(insertAt)
        .map((p) => p.html)
        .join("")
    );
  }

  // Walk paragraphs accumulating word count until we cross the midpoint.
  const total = paragraphs.reduce((s, p) => s + p.words, 0);
  const midpoint = total / 2;
  let running = 0;
  let insertBefore = Math.floor(paragraphs.length / 2); // safe default
  for (let i = 0; i < paragraphs.length; i++) {
    running += paragraphs[i].words;
    if (running >= midpoint) {
      // Insert before paragraph i so the image breaks the flow at the
      // halfway mark rather than after it.
      insertBefore = i;
      break;
    }
  }
  // Never insert before paragraph 0 or after the last — both look bad.
  if (insertBefore <= 0) insertBefore = 1;
  if (insertBefore >= paragraphs.length) insertBefore = paragraphs.length - 1;

  return (
    paragraphs
      .slice(0, insertBefore)
      .map((p) => p.html)
      .join("") +
    figure +
    paragraphs
      .slice(insertBefore)
      .map((p) => p.html)
      .join("")
  );
}