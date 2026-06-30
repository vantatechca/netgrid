import { db } from "@/lib/db";
import { nicheProfiles } from "@/lib/db/schema";

/**
 * A niche profile generated for a client niche that isn't one of the hardcoded
 * niches in src/lib/content/libraries/niches.ts. Stored in the niche_profiles
 * table and cached in memory so runtime lookups are constant-time, exactly like
 * the built-in niches (no per-request DB hit).
 */
export interface NicheProfile {
  /** Normalized niche key, e.g. "restaurant". */
  key: string;
  /** Human-readable display name, e.g. "Restaurant & Food Service". */
  name: string;
  /** Target audience description (maps to NicheContext.defaultAudience). */
  audience: string;
  /** Brand voice (maps to NicheContext.defaultBrandVoice). */
  brandVoice: string;
  /** Content style guidance (maps to NicheContext.contentStyle). */
  contentStyle: string;
  /** Niche-specific writing requirements (maps to getNicheRequirements). */
  requirements: string;
  /** ~10 key topics for ideation + prompts. */
  keyTopics: string[];
  /** Focused topic terms — the primary-compounds pool for this niche. */
  primaryTerms: string[];
  /** Topically-adjacent terms — the secondary-compounds pool. */
  adjacentTerms: string[];
}

// Module-level cache. Populated once by loadNicheProfiles(); read synchronously
// by getCachedNicheProfile() so it can be used inside the (synchronous) prompt
// builders without making them async.
const cache = new Map<string, NicheProfile>();
let loadPromise: Promise<void> | null = null;

function rowToProfile(row: typeof nicheProfiles.$inferSelect): NicheProfile {
  return {
    key: row.key,
    name: row.name,
    audience: row.audience,
    brandVoice: row.brandVoice,
    contentStyle: row.contentStyle,
    requirements: row.requirements,
    keyTopics: row.keyTopics ?? [],
    primaryTerms: row.primaryTerms ?? [],
    adjacentTerms: row.adjacentTerms ?? [],
  };
}

/**
 * Load every generated niche profile into the in-memory cache. Idempotent and
 * cheap after the first call (the promise is memoized). Async entry points
 * (content generation, profile assignment, client creation) await this before
 * reading the cache. On failure the memoized promise is cleared so a later call
 * can retry.
 */
export async function loadNicheProfiles(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const rows = await db.select().from(nicheProfiles);
      cache.clear();
      for (const row of rows) cache.set(row.key, rowToProfile(row));
    })().catch((err) => {
      loadPromise = null; // allow retry
      throw err;
    });
  }
  return loadPromise;
}

/**
 * Synchronous cache read. Returns undefined when the key isn't a generated
 * niche OR the cache hasn't been loaded yet — callers fall back gracefully
 * (synthesized context / empty compounds), so a missed preload only loses the
 * richness, never breaks generation.
 */
export function getCachedNicheProfile(
  key: string | null | undefined,
): NicheProfile | undefined {
  if (!key) return undefined;
  return cache.get(key);
}

/** True if a generated profile already exists for this key (loads the cache). */
export async function hasNicheProfile(key: string): Promise<boolean> {
  await loadNicheProfiles();
  return cache.has(key);
}

/** Persist a profile to the DB and update the in-memory cache. */
export async function upsertNicheProfile(profile: NicheProfile): Promise<void> {
  await db
    .insert(nicheProfiles)
    .values({
      key: profile.key,
      name: profile.name,
      audience: profile.audience,
      brandVoice: profile.brandVoice,
      contentStyle: profile.contentStyle,
      requirements: profile.requirements,
      keyTopics: profile.keyTopics,
      primaryTerms: profile.primaryTerms,
      adjacentTerms: profile.adjacentTerms,
      source: "generated",
    })
    .onConflictDoUpdate({
      target: nicheProfiles.key,
      set: {
        name: profile.name,
        audience: profile.audience,
        brandVoice: profile.brandVoice,
        contentStyle: profile.contentStyle,
        requirements: profile.requirements,
        keyTopics: profile.keyTopics,
        primaryTerms: profile.primaryTerms,
        adjacentTerms: profile.adjacentTerms,
      },
    });
  cache.set(profile.key, profile);
}
