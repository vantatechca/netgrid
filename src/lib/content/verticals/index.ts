/**
 * Barrel + lookup helpers for the vertical-config registry.
 *
 * Resolution order used by the content generator:
 *
 *   1. If a blog has an explicit vertical key (future column on `blogs`),
 *      use verticalConfig(key) directly.
 *   2. Otherwise fall back to verticalForNiche(niche) — picks the first
 *      vertical whose nicheKey matches.
 *   3. If neither resolves, the existing niche-based style profile flow
 *      continues to work unchanged (vertical config is optional metadata).
 */

import { VERTICALS, VERTICAL_KEYS } from "./registry";
import type {
  ContentTrack,
  DataPipelineHint,
  VerticalConfig,
  VerticalLanguage,
} from "./types";

export { VERTICALS, VERTICAL_KEYS };
export type { ContentTrack, DataPipelineHint, VerticalConfig, VerticalLanguage };

/** Returns the config for a vertical key, or null if not registered. */
export function verticalConfig(key: string | null | undefined): VerticalConfig | null {
  if (!key) return null;
  return VERTICALS[key] ?? null;
}

/**
 * Resolves a vertical config from a niche key. When multiple verticals share
 * a niche (universal is shared by gym/lawyer/pest/charity), returns the
 * first registered match. Callers that need a specific vertical should pass
 * the vertical key explicitly instead.
 */
export function verticalForNiche(nicheKey: string | null | undefined): VerticalConfig | null {
  if (!nicheKey) return null;
  for (const key of VERTICAL_KEYS) {
    const v = VERTICALS[key];
    if (v.nicheKey === nicheKey) return v;
  }
  return null;
}

/**
 * Returns every vertical that shares a niche key. Useful for admin UIs that
 * list "all verticals running on the universal niche", etc.
 */
export function verticalsForNiche(nicheKey: string | null | undefined): VerticalConfig[] {
  if (!nicheKey) return [];
  return VERTICAL_KEYS
    .map((k) => VERTICALS[k])
    .filter((v) => v.nicheKey === nicheKey);
}

/**
 * True if the vertical operates on a short pump-and-dump cadence.
 * The auto-publish cron uses this to decide whether to ramp down posting
 * frequency after `expectedLifespanMonths` elapses since the blog's first
 * generated post.
 */
export function isShortLifespanVertical(v: VerticalConfig | null): boolean {
  if (!v) return false;
  return v.expectedLifespanMonths > 0 && v.expectedLifespanMonths <= 6;
}

/**
 * Picks the content track for a given key, or returns null if the vertical
 * runs as a single track (most verticals — only charity has tracks today).
 */
export function contentTrack(
  v: VerticalConfig | null,
  trackKey: string | null | undefined,
): ContentTrack | null {
  if (!v || !trackKey || v.contentTracks.length === 0) return null;
  return v.contentTracks.find((t) => t.key === trackKey) ?? null;
}

/**
 * Returns every disclaimer string that must appear on a post for the given
 * vertical + optional track. Vertical-level disclaimers come first, then
 * track-level disclaimers (when applicable).
 */
export function disclaimersFor(
  v: VerticalConfig | null,
  trackKey: string | null | undefined = null,
): string[] {
  if (!v) return [];
  const out = [...v.disclaimers];
  const track = contentTrack(v, trackKey);
  if (track) out.push(...track.disclaimers);
  return out;
}

/**
 * Returns the byline author role for a post — track override wins over the
 * vertical default. Empty string → caller should fall back to the voice's
 * persona.
 */
export function authorRoleFor(
  v: VerticalConfig | null,
  trackKey: string | null | undefined = null,
): string {
  if (!v) return "";
  const track = contentTrack(v, trackKey);
  if (track?.authorRole) return track.authorRole;
  return v.authorRole;
}
