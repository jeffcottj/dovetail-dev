-- Drop old global unique constraints
ALTER TABLE "articles" DROP CONSTRAINT "articles_slug_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_slug_unique";--> statement-breakpoint

-- Create composite unique indexes (slug unique per category/parent)
CREATE UNIQUE INDEX "articles_slug_category_id_unique" ON "articles" ("slug", "category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_parent_id_unique" ON "categories" ("slug", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'));
