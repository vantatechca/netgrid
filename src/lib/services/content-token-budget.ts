/**
 * Output-token budget model for article generation.
 *
 * Lives in its own module (no imports) so the arithmetic can be unit-tested
 * without loading content-generator.ts, which pulls in the server-action /
 * next-auth import graph via @/lib/actions/news-actions.
 *
 * KEY PRINCIPLE: max_tokens is a COMPLETENESS budget, not a cost lever.
 * Billing is on tokens actually generated, and the model stops on its own
 * when the article is finished. The expensive case is a budget that is too
 * LOW — it truncates the JSON envelope mid-`content`, which costs a full
 * retry and (before T06) published a broken fragment.
 */

/** Language values that can reach the generator. Mirrors GenerateOptions["language"]. */
export type PostLanguage = "en" | "fr" | "en_fr" | undefined;

/**
 * Output tokens per REQUESTED WORD of finished HTML article, serialized
 * inside a JSON string. Three costs are folded into each number:
 *
 *   1. Prose         — English ~1.3 tok/word. French runs heavier: accented
 *                      characters split, elision (l' / d' / qu') adds
 *                      boundaries, and Quebec French uses more words per idea.
 *   2. Markup        — <p>, <h2>, <ul>/<li> and multi-attribute anchors are
 *                      output tokens that are not words (~30-40% on a typical
 *                      article with headings, lists and 3-5 links).
 *   3. JSON escaping — every HTML attribute quote becomes \" and every
 *                      newline becomes \n, each an extra token.
 *
 * Deliberately generous. Over-budgeting is free; under-budgeting truncates.
 */
export const TOKENS_PER_WORD = { en: 1.9, fr: 2.9 } as const;

/**
 * Flat allowance for everything in the envelope that is NOT the body:
 * title (~20) + excerpt 160ch (~50) + metaTitle (~20) + metaDescription
 * 160ch (~50) + keywords[4-8] (~45) + field names/braces/commas (~40)
 * = ~225 tokens. Rounded up so a model that writes a long excerpt still
 * has room to close the object instead of stopping one token short of `}`.
 */
export const JSON_ENVELOPE_TOKENS = 700;

/**
 * Applied on top of everything above. Covers per-post variance in markup
 * density (a listicle with 30 <li> costs far more markup than 8 <p>) and
 * the routine overshoot past the requested word target.
 */
export const TOKEN_BUDGET_SAFETY = 1.15;

/** Floor, so a short-band profile still gets room for a complete post. */
export const MIN_OUTPUT_TOKENS = 3000;

/**
 * Per-provider output ceiling — Claude.
 *
 * claude-sonnet-4-6 accepts up to 128,000 output tokens. We do NOT use that
 * headroom: callClaudeOnce issues a NON-STREAMING request, and the SDK's
 * request timeout applies. 16,000 is the standard non-streaming default and
 * is still ~2x the largest budget this formula can produce (2000 French
 * words -> 7,475). If a future task ever needs more than this, switch
 * callClaudeOnce to anthropic.messages.stream() first.
 */
export const CLAUDE_MAX_OUTPUT_TOKENS = 16_000;

/**
 * Per-provider output ceiling — DeepSeek.
 *
 * DEEPSEEK_MODEL is env-configurable and points at a generic
 * OpenAI-compatible endpoint, so this repository cannot know the real
 * ceiling. 8192 is a conservative value that comfortably covers the largest
 * budget the formula produces (7,475). Raise it via
 * DEEPSEEK_MAX_OUTPUT_TOKENS once you have confirmed the deployed model's
 * documented limit.
 *
 * Read lazily (function, not const) so a test or a script can change the env
 * var after module load.
 */
export function deepseekMaxOutputTokens(): number {
  const raw = Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8192;
}

/**
 * Output-token budget for ONE article-generation call.
 *
 *   budget = ceil((words x tokensPerWord + envelope) x safety)
 *   floored at MIN_OUTPUT_TOKENS
 *
 * There is deliberately NO fixed ceiling here. The per-provider ceiling is
 * applied inside callClaudeOnce / callDeepSeekOnce, which are the only two
 * places that know which model is about to serve the request. The old
 * expression —
 *
 *   Math.min(4096, Math.max(3000, Math.round(MAX_WORDS * 3.2)))
 *
 * — always evaluated to exactly 4096 because MAX_WORDS is 2000 and
 * 2000 * 3.2 = 6400. That is ~1280 French words against a 1000-2000 band.
 *
 * Reference values (see content-token-budget.test.ts):
 *   en 1000 -> 3000 (floor)    fr 1000 -> 4140
 *   en 1500 -> 4083            fr 1500 -> 5808
 *   en 2000 -> 5175            fr 2000 -> 7475
 */
export function outputTokenBudget(
  wordBudget: number,
  language: PostLanguage,
): number {
  // "en_fr" should have been resolved to a concrete language upstream by
  // postLanguageForDomain. If one slips through, budget it as French:
  // over-budgeting is free, under-budgeting truncates.
  const perWord =
    language === "fr" || language === "en_fr"
      ? TOKENS_PER_WORD.fr
      : TOKENS_PER_WORD.en;

  const raw =
    (wordBudget * perWord + JSON_ENVELOPE_TOKENS) * TOKEN_BUDGET_SAFETY;

  return Math.max(MIN_OUTPUT_TOKENS, Math.ceil(raw));
}
