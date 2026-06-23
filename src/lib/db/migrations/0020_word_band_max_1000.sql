-- Tighten the network-wide word-band ceiling from 1500 to 1000 words.
--
-- Migration 0010 set every profile to 800-1500. The policy is now 800-1000
-- (see GLOBAL_WORD_BAND_MIN / GLOBAL_WORD_BAND_MAX in
-- src/lib/content/config.ts). Lower max means shorter posts → fewer output
-- tokens per generation → lower Claude API cost across the whole network.
--
-- The profile-driven generation path reads style_profiles.word_band_max both
-- for the prompt's {word_band_max} target AND for the max_tokens budget, so
-- existing rows must be updated for the saving to take effect on already
-- assigned blogs (new blogs already get 1000 from the algorithm).
--
-- Idempotent — safe to re-run.

UPDATE "style_profiles"
SET
  "word_band_min" = 800,
  "word_band_max" = 1000
WHERE
  "word_band_min" <> 800
  OR "word_band_max" <> 1000;
