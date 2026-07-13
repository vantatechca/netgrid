-- Dosage dimension + buy-phrase money links for peptide location pages.
--
-- Dosage is optional: the matrix always builds the plain (no-dosage) page and,
-- when the client has a global dosage list, also builds one page per dosage.
-- Stored as '' when absent so the uniqueness key stays simple.

-- Per-client global dosage list (newline/comma separated), e.g. "5mg\n10mg".
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "peptide_dosages" text;

-- Dosage on each target ('' = no dosage). Backfills existing rows to ''.
ALTER TABLE "peptide_location_targets" ADD COLUMN IF NOT EXISTS "dosage" varchar(40) NOT NULL DEFAULT '';

-- Re-key uniqueness to include dosage so a (compound × dosage × location) page
-- is distinct from the plain (compound × location) one.
DROP INDEX IF EXISTS "peptide_location_targets_unique_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "peptide_location_targets_unique_idx"
  ON "peptide_location_targets" ("blog_id", "compound", "dosage", "location");
