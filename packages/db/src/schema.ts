import { relations, sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// -- Enums --

export const roleEnum = pgEnum('role', ['viewer', 'editor', 'admin']);
export const providerEnum = pgEnum('oauth_provider', ['google', 'entra']);
export const statusEnum = pgEnum('article_status', ['draft', 'published', 'archived']);

// -- Vector type for pgvector --

const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${(config as { dimensions: number }).dimensions})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  },
});

// -- Tables --

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').notNull().default('viewer'),
  provider: providerEnum('provider').notNull(),
  providerId: text('provider_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  parentId: uuid('parent_id'),  // references categories.id — added below via relations
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userCategoryRoles = pgTable(
  'user_category_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  content: jsonb('content').notNull().default({}),
  status: statusEnum('status').notNull().default('draft'),
  plainText: text('plain_text'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  publishedAt: timestamp('published_at'),
});

export const articleVersions = pgTable('article_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: jsonb('content').notNull(),
  authorId: uuid('author_id').notNull().references(() => users.id),
  versionNumber: integer('version_number').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const articleTags = pgTable(
  'article_tags',
  {
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

export const articleEmbeddings = pgTable('article_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// -- Relations (for Drizzle's query builder) --

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  articles: many(articles),
  userRoles: many(userCategoryRoles),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  category: one(categories, { fields: [articles.categoryId], references: [categories.id] }),
  author: one(users, { fields: [articles.authorId], references: [users.id] }),
  versions: many(articleVersions),
  articleTags: many(articleTags),
  embeddings: many(articleEmbeddings),
}));
