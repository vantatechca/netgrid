-- Semantic linking: pgvector embeddings + related-posts bookkeeping.
--
-- Adds a dense vector embedding to generated_posts so we can find
-- contextually-similar posts (cosine similarity) and auto-link them, plus
-- columns recording which model produced the vector and the related posts we
-- last linked in. Idempotent: safe to replay against an already-migrated DB
-- (the runner swallows duplicate-column / duplicate-index errors).

-- pgvector extension (Neon ships it; no-op if already enabled).
CREATE EXTENSION IF NOT EXISTS vector;

-- 1536 = OpenAI text-embedding-3-small. Null until the post is embedded.
ALTER TABLE "generated_posts" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "generated_posts" ADD COLUMN IF NOT EXISTS "embedding_model" varchar(64);
ALTER TABLE "generated_posts" ADD COLUMN IF NOT EXISTS "embedded_at" timestamp;

-- Related posts last linked into this post: [{ id, title, url }].
ALTER TABLE "generated_posts" ADD COLUMN IF NOT EXISTS "related_posts" jsonb;
ALTER TABLE "generated_posts" ADD COLUMN IF NOT EXISTS "related_linked_at" timestamp;

-- HNSW index for fast cosine-distance search. vector_cosine_ops matches the
-- `<=>` operator the similarity query uses. Built concurrently-safe on an
-- empty/small column; the index simply grows as posts get embedded.
CREATE INDEX IF NOT EXISTS "generated_posts_embedding_idx"
  ON "generated_posts" USING hnsw ("embedding" vector_cosine_ops);
