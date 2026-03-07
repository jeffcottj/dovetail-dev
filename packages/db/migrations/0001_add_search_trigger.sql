-- Add plain_text column for extracted article text
ALTER TABLE articles ADD COLUMN IF NOT EXISTS plain_text text;

-- Drop the old search_vector text column and recreate as tsvector
ALTER TABLE articles DROP COLUMN IF EXISTS search_vector;

-- Add tsvector column managed by trigger
ALTER TABLE articles ADD COLUMN search_vector tsvector;

-- Create trigger function to update search_vector from title + plain_text
CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.plain_text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, plain_text ON articles
  FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS articles_search_idx ON articles USING GIN(search_vector);
