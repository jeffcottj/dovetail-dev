CREATE TYPE kb_default_access AS ENUM ('org_viewer', 'private');

ALTER TABLE knowledge_bases
  ADD COLUMN default_access kb_default_access NOT NULL DEFAULT 'org_viewer';
