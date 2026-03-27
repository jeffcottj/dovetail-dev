-- Knowledge bases tables and backfill migration

-- Create knowledge_bases table
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Create user_kb_roles table
CREATE TABLE IF NOT EXISTS user_kb_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  role role NOT NULL,
  PRIMARY KEY (user_id, knowledge_base_id)
);

-- Create api_key_knowledge_bases junction table
CREATE TABLE IF NOT EXISTS api_key_knowledge_bases (
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  PRIMARY KEY (api_key_id, knowledge_base_id)
);

-- Insert default knowledge base
INSERT INTO knowledge_bases (id, name, slug, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default', 'Default knowledge base');

-- Add nullable columns first
ALTER TABLE categories ADD COLUMN IF NOT EXISTS knowledge_base_id uuid;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS knowledge_base_id uuid;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS knowledge_base_id uuid;

-- Backfill
UPDATE categories SET knowledge_base_id = '00000000-0000-0000-0000-000000000001' WHERE knowledge_base_id IS NULL;
UPDATE tags SET knowledge_base_id = '00000000-0000-0000-0000-000000000001' WHERE knowledge_base_id IS NULL;
UPDATE import_jobs SET knowledge_base_id = '00000000-0000-0000-0000-000000000001' WHERE knowledge_base_id IS NULL;

-- Set NOT NULL
ALTER TABLE categories ALTER COLUMN knowledge_base_id SET NOT NULL;
ALTER TABLE tags ALTER COLUMN knowledge_base_id SET NOT NULL;
ALTER TABLE import_jobs ALTER COLUMN knowledge_base_id SET NOT NULL;

-- Add FK constraints
ALTER TABLE categories ADD CONSTRAINT categories_knowledge_base_id_fk FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id);
ALTER TABLE tags ADD CONSTRAINT tags_knowledge_base_id_fk FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id);
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_knowledge_base_id_fk FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id);

-- Associate existing API keys with default KB
INSERT INTO api_key_knowledge_bases (api_key_id, knowledge_base_id)
SELECT id, '00000000-0000-0000-0000-000000000001' FROM api_keys;

-- Drop old unique indexes and create new ones
DROP INDEX IF EXISTS categories_slug_parent_id_unique;
CREATE UNIQUE INDEX categories_slug_parent_id_kb_unique ON categories (slug, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'), knowledge_base_id);

DROP INDEX IF EXISTS tags_name_key;
DROP INDEX IF EXISTS tags_slug_key;
CREATE UNIQUE INDEX tags_slug_kb_unique ON tags (slug, knowledge_base_id);
CREATE UNIQUE INDEX tags_name_kb_unique ON tags (name, knowledge_base_id);
