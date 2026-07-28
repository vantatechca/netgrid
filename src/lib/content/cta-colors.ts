// Preset CTA button colors an operator can pick per client.
//
// Applies to the injected CTA button (Explore More / Visit Us / etc.) and the
// registration form's Register button. When a client has no color set, the
// button keeps its per-blog derived color (footprint variety). Isomorphic (no
// imports) so the client form and the server generator share one source.

export interface CtaColor {
  key: string;
  label: string;
  hex: string;
}

export const CTA_COLORS: CtaColor[] = [
  { key: "slate", label: "Slate", hex: "#1f2937" },
  { key: "black", label: "Black", hex: "#111111" },
  { key: "blue", label: "Blue", hex: "#2563eb" },
  { key: "green", label: "Green", hex: "#16a34a" },
  { key: "red", label: "Red", hex: "#dc2626" },
  { key: "orange", label: "Orange", hex: "#ea580c" },
  { key: "purple", label: "Purple", hex: "#7c3aed" },
  { key: "teal", label: "Teal", hex: "#0d9488" },
  { key: "pink", label: "Pink", hex: "#db2777" },
];

const BY_KEY = new Map(CTA_COLORS.map((c) => [c.key, c]));

/**
 * Resolve a stored CTA color to its hex, or null when unset/unknown ("auto" —
 * the per-blog derived color is kept). Accepts a preset key; a raw #hex is
 * passed through so a future custom-color path still works.
 */
export function ctaColorHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (BY_KEY.has(v)) return BY_KEY.get(v)!.hex;
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  return null;
}
