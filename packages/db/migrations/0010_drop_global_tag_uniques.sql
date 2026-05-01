-- Tags are scoped to a knowledge base. Remove legacy global uniqueness that
-- prevents the same tag name or slug from existing in separate KBs.
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_name_unique";
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_slug_unique";

DROP INDEX IF EXISTS "tags_name_unique";
DROP INDEX IF EXISTS "tags_slug_unique";
DROP INDEX IF EXISTS "tags_name_key";
DROP INDEX IF EXISTS "tags_slug_key";

CREATE UNIQUE INDEX IF NOT EXISTS "tags_slug_kb_unique" ON "tags" ("slug", "knowledge_base_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_kb_unique" ON "tags" ("name", "knowledge_base_id");
