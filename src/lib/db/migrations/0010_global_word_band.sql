-- Apply the network-wide word-band policy to every existing style profile.
-- New rule: minimum 800, maximum 1500 words for every blog regardless of
-- niche / voice / cadence / template-pool tier.
--
-- The constants live in src/lib/content/config.ts
-- (GLOBAL_WORD_BAND_MIN / GLOBAL_WORD_BAND_MAX) and are referenced by:
--   - the assignment algorithm (new profiles get these values)
--   - the legacy generation path (non-profile niches)
--   - the composer (substituted into the prompt)
--   - the scrubber Layer 1F (word-count validation)
--
-- This migration brings the existing profile rows in line with the new
-- policy. Idempotent — safe to re-run.

UPDATE "style_profiles"
SET
  "word_band_min" = 800,
  "word_band_max" = 1500
WHERE
  "word_band_min" <> 800
  OR "word_band_max" <> 1500;
