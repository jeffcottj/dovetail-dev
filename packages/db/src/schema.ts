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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// -- Enums --

export const roleEnum = pgEnum('role', ['viewer', 'editor', 'admin']);
export const providerEnum = pgEnum('oauth_provider', ['google', 'entra']);
export const statusEnum = pgEnum('article_status', ['draft', 'published', 'archived']);
export const kbDefaultAccessEnum = pgEnum('kb_default_access', ['org_viewer', 'private']);
export const attachmentExtractionStatusEnum = pgEnum('attachment_extraction_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'unsupported',
]);

// -- Knowledge Bases --

export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  defaultAccess: kbDefaultAccessEnum('default_access').notNull().default('org_viewer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

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
  slug: text('slug').notNull(),
  parentId: uuid('parent_id'),
  knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('categories_slug_parent_id_kb_unique')
    .on(t.slug, sql`COALESCE(${t.parentId}, '00000000-0000-0000-0000-000000000000')`, t.knowledgeBaseId),
]);

export const userCategoryRoles = pgTable(
  'user_category_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

export const userKbRoles = pgTable(
  'user_kb_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.knowledgeBaseId] })],
);

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  lastEditedById: uuid('last_edited_by_id').notNull().references(() => users.id),
  content: jsonb('content').notNull().default({}),
  status: statusEnum('status').notNull().default('draft'),
  plainText: text('plain_text'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  publishedAt: timestamp('published_at'),
}, (t) => [
  uniqueIndex('articles_slug_category_id_unique').on(t.slug, t.categoryId),
]);

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
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id),
}, (t) => [
  uniqueIndex('tags_slug_kb_unique').on(t.slug, t.knowledgeBaseId),
  uniqueIndex('tags_name_kb_unique').on(t.name, t.knowledgeBaseId),
]);

export const articleTags = pgTable(
  'article_tags',
  {
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
});

export const adminActivityEvents = pgTable('admin_activity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  knowledgeBaseId: uuid('knowledge_base_id').references(() => knowledgeBases.id, { onDelete: 'set null' }),
  subjectId: text('subject_id').notNull(),
  subjectLabel: text('subject_label').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const apiKeyKnowledgeBases = pgTable(
  'api_key_knowledge_bases',
  {
    apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
    knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.knowledgeBaseId] })],
);

export const importStatusEnum = pgEnum('import_status', ['pending', 'running', 'completed', 'failed']);

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  extractionStatus: attachmentExtractionStatusEnum('extraction_status').notNull().default('pending'),
  extractedText: text('extracted_text'),
  extractionError: text('extraction_error'),
  extractedAt: timestamp('extracted_at'),
  indexedAt: timestamp('indexed_at'),
  contentHash: text('content_hash'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: importStatusEnum('status').notNull().default('pending'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id),
  totalArticles: integer('total_articles').notNull().default(0),
  importedCount: integer('imported_count').notNull().default(0),
  errorLog: jsonb('error_log').notNull().default([]),
  options: jsonb('options').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const articleEmbeddings = pgTable('article_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const attachmentEmbeddings = pgTable('attachment_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  attachmentId: uuid('attachment_id').notNull().references(() => attachments.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// -- Relations (for Drizzle's query builder) --

export const knowledgeBasesRelations = relations(knowledgeBases, ({ many }) => ({
  categories: many(categories),
  tags: many(tags),
  userKbRoles: many(userKbRoles),
  apiKeyKnowledgeBases: many(apiKeyKnowledgeBases),
  importJobs: many(importJobs),
}));

export const userKbRolesRelations = relations(userKbRoles, ({ one }) => ({
  user: one(users, { fields: [userKbRoles.userId], references: [users.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [userKbRoles.knowledgeBaseId], references: [knowledgeBases.id] }),
}));

export const apiKeyKnowledgeBasesRelations = relations(apiKeyKnowledgeBases, ({ one }) => ({
  apiKey: one(apiKeys, { fields: [apiKeyKnowledgeBases.apiKeyId], references: [apiKeys.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [apiKeyKnowledgeBases.knowledgeBaseId], references: [knowledgeBases.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: 'categoryParent' }),
  children: many(categories, { relationName: 'categoryParent' }),
  knowledgeBase: one(knowledgeBases, { fields: [categories.knowledgeBaseId], references: [knowledgeBases.id] }),
  articles: many(articles),
  userRoles: many(userCategoryRoles),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  category: one(categories, { fields: [articles.categoryId], references: [categories.id] }),
  author: one(users, { fields: [articles.authorId], references: [users.id] }),
  lastEditor: one(users, { fields: [articles.lastEditedById], references: [users.id] }),
  versions: many(articleVersions),
  articleTags: many(articleTags),
  embeddings: many(articleEmbeddings),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  article: one(articles, { fields: [attachments.articleId], references: [articles.id] }),
}));

export const attachmentEmbeddingsRelations = relations(attachmentEmbeddings, ({ one }) => ({
  attachment: one(attachments, { fields: [attachmentEmbeddings.attachmentId], references: [attachments.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  articles: many(articles),
  articleVersions: many(articleVersions),
  apiKeys: many(apiKeys),
  categoryRoles: many(userCategoryRoles),
  kbRoles: many(userKbRoles),
  importJobs: many(importJobs),
}));

export const articleVersionsRelations = relations(articleVersions, ({ one }) => ({
  article: one(articles, { fields: [articleVersions.articleId], references: [articles.id] }),
  author: one(users, { fields: [articleVersions.authorId], references: [users.id] }),
}));

export const articleTagsRelations = relations(articleTags, ({ one }) => ({
  article: one(articles, { fields: [articleTags.articleId], references: [articles.id] }),
  tag: one(tags, { fields: [articleTags.tagId], references: [tags.id] }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases, { fields: [tags.knowledgeBaseId], references: [knowledgeBases.id] }),
  articleTags: many(articleTags),
}));

export const articleEmbeddingsRelations = relations(articleEmbeddings, ({ one }) => ({
  article: one(articles, { fields: [articleEmbeddings.articleId], references: [articles.id] }),
}));

export const userCategoryRolesRelations = relations(userCategoryRoles, ({ one }) => ({
  user: one(users, { fields: [userCategoryRoles.userId], references: [users.id] }),
  category: one(categories, { fields: [userCategoryRoles.categoryId], references: [categories.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  createdByUser: one(users, { fields: [apiKeys.createdBy], references: [users.id] }),
  knowledgeBases: many(apiKeyKnowledgeBases),
}));

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  createdByUser: one(users, { fields: [importJobs.createdBy], references: [users.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [importJobs.knowledgeBaseId], references: [knowledgeBases.id] }),
}));
