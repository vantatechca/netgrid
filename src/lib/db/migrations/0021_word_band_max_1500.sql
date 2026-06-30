-- Set the network-wide word band to 1000-1500 words.
--
-- Supersedes migration 0020 (which set 800-1000). The policy is now 1000-1500
-- (see GLOBAL_WORD_BAND_MIN / GLOBAL_WORD_BAND_MAX in src/lib/content/config.ts).
--
-- NOTE: the generator now clamps each profile's band to the live config in
-- memory at generation time, so word count already honours 1000-1500 WITHOUT
-- this migration. Running it just keeps the stored rows (shown in the Style
-- Profile panel) consistent with the policy. Idempotent — safe to re-run.
-- (Equivalent to running: npm run db:repair-compounds)

UPDATE "style_profiles"
SET
  "word_band_min" = 1000,
  "word_band_max" = 1500
WHERE
  "word_band_min" <> 1000
  OR "word_band_max" <> 1500;
