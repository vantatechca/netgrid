-- Change style_profiles.min_hamming_at_assign from integer to decimal.
--
-- The Hamming distance produced by the assignment algorithm is the sum
-- of integer single-valued mismatches plus 3 Jaccard distances (each
-- 0.0-1.0). Result is fractional (e.g. 9.55), which postgres rejected
-- as "invalid input syntax for type integer".
--
-- Realistic range is 0.00-11.00. Using decimal(5,2) is comfortable.

ALTER TABLE "style_profiles"
  ALTER COLUMN "min_hamming_at_assign" TYPE numeric(5, 2)
  USING "min_hamming_at_assign"::numeric(5, 2);
