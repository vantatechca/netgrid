/**
 * Pixel-width estimation for SEO meta fields — the unit search engines and
 * Seobility actually use to truncate the title tag and meta description.
 *
 * Title tags render at ~20px Arial and meta descriptions at ~14px Arial;
 * both are cut off by PIXEL width, not character count (titles over 580px
 * and descriptions over 1000px get truncated / flagged). We estimate width
 * with an Arial advance-width table (em = 1000 units), calibrated against
 * real audit values — a 783px title and a 1999px description both reproduce
 * within <1%.
 *
 * Single source of truth shared by:
 *   - content-generator (normalize meta on generation)
 *   - seo-backfill (retroactively fix live posts)
 *   - seo-crawler / seo-scorer (in-app audit, so it matches Seobility)
 */

export const ARIAL_WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667,
  "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333,
  ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556,
  "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 278, ";": 278,
  "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, A: 667, B: 667,
  C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667,
  L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 278, "\\": 278,
  "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500, d: 556,
  e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500,
  w: 722, x: 500, y: 500, z: 500, "{": 334, "|": 260, "}": 334, "~": 584,
  "–": 556, "—": 1000, "’": 222, "‘": 222, "“": 333, "”": 333, "…": 1000,
};

export const ARIAL_DEFAULT_WIDTH = 556;

// Rendering font sizes (Google desktop SERP).
export const TITLE_FONT_PX = 20;
export const DESC_FONT_PX = 14;

// Hard audit ceilings (Seobility / Google).
export const TITLE_MAX_PX = 580;
export const DESC_MAX_PX = 1000;

// Lower bounds — narrower than this renders too thin to be useful (advisory).
export const TITLE_MIN_PX = 200;
export const DESC_MIN_PX = 430;

// Strict-safe WRITE targets — what we generate/normalize TO, leaving headroom
// under the audit ceilings so minor rendering differences never trip a flag.
export const TITLE_TARGET_PX = 555;
export const DESC_TARGET_PX = 960;

/** Estimated rendered width of `text` in pixels at the given font size. */
export function measureTextPx(text: string, fontPx: number): number {
  let units = 0;
  for (const ch of text) units += ARIAL_WIDTHS[ch] ?? ARIAL_DEFAULT_WIDTH;
  return (units / 1000) * fontPx;
}

/** Rendered width of a title tag (~20px Arial), in pixels. */
export function measureTitlePx(text: string): number {
  return measureTextPx(text, TITLE_FONT_PX);
}

/** Rendered width of a meta description (~14px Arial), in pixels. */
export function measureDescriptionPx(text: string): number {
  return measureTextPx(text, DESC_FONT_PX);
}

/**
 * Trim `text` so it renders within `maxPx` at `fontPx`, breaking on word
 * boundaries and stripping any dangling separator/punctuation. If even the
 * first word overflows, hard-cuts by character as a last resort.
 */
export function truncateToPx(
  text: string,
  fontPx: number,
  maxPx: number,
): string {
  if (measureTextPx(text, fontPx) <= maxPx) return text;
  const words = text.split(/\s+/);
  let out = "";
  for (const w of words) {
    const candidate = out ? `${out} ${w}` : w;
    if (measureTextPx(candidate, fontPx) > maxPx) break;
    out = candidate;
  }
  if (!out) {
    let cut = "";
    for (const ch of text) {
      if (measureTextPx(cut + ch, fontPx) > maxPx) break;
      cut += ch;
    }
    out = cut;
  }
  return out.replace(/[\s,;:.\-|–—]+$/, "").trim();
}
