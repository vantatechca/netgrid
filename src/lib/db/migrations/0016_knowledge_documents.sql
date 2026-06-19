-- Knowledge documents — the per-client Knowledge Base. The team uploads
-- client briefs, keyword sheets, brand guides, etc.; each file is normalised
-- to Markdown at upload (services/knowledge-converter.ts) and run through a
-- one-time extraction pass (services/knowledge-extractor.ts) that distills
-- keywords, topics, and a summary. Ideation/generation later read the active
-- rows for a blog/client so Claude works from the client's actual material
-- instead of generic per-niche keyword lists.
--
-- blog_id is nullable: when set, the document is scoped to a single blog;
-- when null it applies to the whole client (shared across all its blogs).

DO $$ BEGIN
  CREATE TYPE "knowledge_source_type" AS ENUM ('spreadsheet', 'csv', 'docx', 'pdf', 'image', 'text');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "knowledge_extraction_status" AS ENUM ('pending', 'extracted', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "knowledge_documents" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id"          uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "blog_id"            uuid REFERENCES "blogs"("id") ON DELETE CASCADE,
  "file_name"          varchar(500) NOT NULL,
  "content_type"       varchar(150),
  "source_type"        "knowledge_source_type" NOT NULL,
  "markdown"           text NOT NULL,
  "char_count"         integer NOT NULL DEFAULT 0,
  "low_confidence"     boolean NOT NULL DEFAULT false,
  "warnings"           jsonb,
  "extracted_keywords" jsonb,
  "extracted_topics"   jsonb,
  "summary"            text,
  "extraction_status"  "knowledge_extraction_status" NOT NULL DEFAULT 'pending',
  "extraction_error"   text,
  "is_active"          boolean NOT NULL DEFAULT true,
  "uploaded_by"        uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  "updated_at"         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "knowledge_documents_client_id_idx" ON "knowledge_documents" ("client_id");
CREATE INDEX IF NOT EXISTS "knowledge_documents_blog_id_idx" ON "knowledge_documents" ("blog_id");
CREATE INDEX IF NOT EXISTS "knowledge_documents_active_idx" ON "knowledge_documents" ("is_active");
