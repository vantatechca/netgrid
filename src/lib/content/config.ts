/**
 * Network-wide content-generation policy constants. Single source of truth
 * for cross-cutting limits and thresholds. Imported by:
 *
 *   - content-generator.ts (legacy MIN_WORDS/MAX_WORDS path)
 *   - assignment/algorithm.ts (pickWordBand always returns this range)
 *   - composer/compose.ts (substitutes into prompt's word-count section)
 *
 * Lives in src/lib/content/ rather than src/lib/services/ to avoid a
 * circular import between content-generator.ts and the algorithm.
 */

/**
 * Minimum word count for every generated blog post.
 *
 * Applied:
 *   - At assignment time → every new style profile's wordBandMin = this
 *   - At generation time → prompt instructs Claude to stay >= this
 *   - At scrubber time   → Layer 1F flags posts below this as too short
 */
export const GLOBAL_WORD_BAND_MIN = 800;

/**
 * Maximum word count for every generated blog post.
 *
 * Applied at the same three points as the minimum. The scrubber treats
 * up to MAX × 1.10 as a soft-trim zone before flagging as a regenerate
 * candidate.
 */
export const GLOBAL_WORD_BAND_MAX = 1000;
