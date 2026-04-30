CREATE TYPE "attachment_extraction_status" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'unsupported');

ALTER TABLE "attachments"
  ADD COLUMN "extraction_status" "attachment_extraction_status" NOT NULL DEFAULT 'pending',
  ADD COLUMN "extracted_text" text,
  ADD COLUMN "extraction_error" text,
  ADD COLUMN "extracted_at" timestamp,
  ADD COLUMN "indexed_at" timestamp,
  ADD COLUMN "content_hash" text,
  ADD COLUMN "search_vector" tsvector;

CREATE OR REPLACE FUNCTION attachments_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.filename, '') || ' ' || COALESCE(NEW.extracted_text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attachments_search_vector_trigger
  BEFORE INSERT OR UPDATE OF filename, extracted_text ON attachments
  FOR EACH ROW EXECUTE FUNCTION attachments_search_vector_update();

UPDATE attachments SET filename = filename;

CREATE INDEX IF NOT EXISTS attachments_search_idx ON attachments USING GIN(search_vector);

CREATE TABLE "attachment_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attachment_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "chunk_text" text NOT NULL,
  "embedding" vector(1536),
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "attachment_embeddings"
  ADD CONSTRAINT "attachment_embeddings_attachment_id_attachments_id_fk"
  FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS attachment_embeddings_attachment_id_idx ON attachment_embeddings(attachment_id);
