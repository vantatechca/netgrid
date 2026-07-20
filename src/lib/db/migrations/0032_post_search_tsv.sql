-- Hybrid semantic linking: sparse (full-text) half of the dense+sparse blend.
--
-- Adds a tsvector column to generated_posts so we can score keyword/lexical
-- overlap (Postgres FTS is our TF-IDF-equivalent "sparse" signal) alongside
-- the pgvector cosine ("dense") signal. The column is maintained in app code
-- from the same sanitized title+body we embed (so HTML tags and base64 image
-- data don't pollute it). Idempotent — safe to replay.

ALTER TABLE "generated_posts" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector;

-- GIN index for fast full-text ranking (ts_rank / @@).
CREATE INDEX IF NOT EXISTS "generated_posts_search_tsv_idx"
  ON "generated_posts" USING gin ("search_tsv");
