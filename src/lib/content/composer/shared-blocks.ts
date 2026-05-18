import {
  BLOCK_AI_TELLS,
  BLOCK_CITATIONS,
  BLOCK_COMPLIANCE,
  BLOCK_COMPLIANCE_BRIEF,
  BLOCK_OUTPUT_FORMAT,
} from "../libraries/ai-tells";
import type { SharedBlock } from "../types";

/**
 * Map shared-block markers to their body text. Markers in skeletons look
 * like `[BLOCK_AI_TELLS]` — the composer replaces them by name.
 */
export const SHARED_BLOCK_BODIES: Record<SharedBlock, string> = {
  AI_TELLS: BLOCK_AI_TELLS,
  OUTPUT_FORMAT: BLOCK_OUTPUT_FORMAT,
  COMPLIANCE: BLOCK_COMPLIANCE,
  COMPLIANCE_BRIEF: BLOCK_COMPLIANCE_BRIEF,
  CITATIONS: BLOCK_CITATIONS,
};

/**
 * Replace every [BLOCK_X] marker in `body` with the rendered block body.
 * Unknown markers are left untouched (and will surface as obvious anomalies).
 */
export function inlineSharedBlocks(body: string): string {
  return body.replace(/\[BLOCK_([A-Z_]+)\]/g, (_, name) => {
    const key = name as SharedBlock;
    return SHARED_BLOCK_BODIES[key] ?? `[BLOCK_${name}]`;
  });
}
