# Multiple Knowledge Bases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class multiple knowledge base support with separate permissions, search scoping, and RAG scoping per KB.

**Architecture:** New `knowledge_bases` table as parent to categories. Three-tier RBAC (global → KB → category). All content API routes nested under `/api/knowledge-bases/:kbId/`. Frontend routes under `/kb/:kbSlug/`. Migration creates a "Default" KB and backfills existing data.

**Tech Stack:** Drizzle ORM, Express 5, Next.js 15 App Router, PostgreSQL, pgvector, Zod, Vitest + supertest

**Design Spec:** `docs/superpowers/specs/2026-03-27-multiple-knowledge-bases-design.md`

---

## File Structure

### New files (API)
- `apps/api/src/routes/knowledge-bases.ts` — KB CRUD + KB user role management
- `apps/api/src/middleware/resolveKb.ts` — Middleware to validate `:kbId` param and attach KB to request
- `apps/api/src/__tests__/routes/knowledge-bases.test.ts`
- `apps/api/src/__tests__/middleware/resolveKb.test.ts`
- `apps/api/src/__tests__/services/permissions.test.ts`

### New files (Frontend)
- `apps/web/app/(main)/kb/[kbSlug]/layout.tsx` — KB context provider, sidebar with KB category tree
- `apps/web/app/(main)/kb/[kbSlug]/page.tsx` — KB home page
- `apps/web/app/(main)/kb/[kbSlug]/articles/new/page.tsx` — New article in KB
- `apps/web/app/(main)/kb/[kbSlug]/articles/[...slugPath]/page.tsx` — Article view/edit/history
- `apps/web/app/(main)/kb/[kbSlug]/categories/[...slugPath]/page.tsx` — Category view
- `apps/web/app/(main)/kb/[kbSlug]/search/page.tsx` — KB-scoped search
- `apps/web/app/(main)/kb/[kbSlug]/admin/page.tsx` — KB admin dashboard
- `apps/web/app/(main)/kb/[kbSlug]/admin/users/page.tsx` — KB user/role management
- `apps/web/app/(main)/kb/[kbSlug]/admin/tags/page.tsx` — KB tag management
- `apps/web/app/(main)/kb/[kbSlug]/admin/import/page.tsx` — Import into KB
- `apps/web/app/(main)/admin/knowledge-bases/page.tsx` — Global KB management
- `apps/web/components/KbSidebar.tsx` — KB-scoped sidebar
- `apps/web/components/KbSwitcher.tsx` — KB picker dropdown
- `apps/web/lib/hooks/useKb.ts` — Client-side hook for current KB context

### Modified files (API)
- `packages/db/src/schema.ts` — New tables + modified columns
- `packages/types/src/index.ts` — New interfaces + updated existing
- `apps/api/src/app.ts` — Route mounting restructure
- `apps/api/src/routes/categories.ts` — Add KB scoping
- `apps/api/src/routes/articles.ts` — Add KB scoping
- `apps/api/src/routes/tags.ts` — Add KB scoping
- `apps/api/src/routes/search.ts` — Add KB scoping
- `apps/api/src/routes/rag.ts` — Add KB scoping + API key KB validation
- `apps/api/src/routes/me.ts` — Add optional knowledgeBaseId param
- `apps/api/src/routes/versions.ts` — Add mergeParams
- `apps/api/src/routes/admin/import.ts` — Add KB scoping
- `apps/api/src/routes/admin/api-keys.ts` — Add KB association on create
- `apps/api/src/routes/admin/users.ts` — Add KB role management
- `apps/api/src/services/permissions.ts` — Three-tier RBAC
- `apps/api/src/services/import/import-engine.ts` — Accept knowledgeBaseId
- `apps/api/src/utils/category-path.ts` — Scope to KB
- `apps/api/src/middleware/apiKeyAuth.ts` — Attach KB IDs to request

### Modified files (Frontend)
- `apps/web/app/(main)/layout.tsx` — Remove sidebar (moves to KB layout)
- `apps/web/app/(main)/page.tsx` — Dashboard with KB list
- `apps/web/components/Sidebar.tsx` — Extract into KbSidebar
- `apps/web/lib/article-url.ts` — Accept kbSlug prefix
- `apps/web/lib/api-client.ts` — No changes needed
- `apps/web/app/(main)/admin/api-keys/page.tsx` — Add KB scoping UI

### Files to remove (after migration)
- `apps/web/app/(main)/articles/` — Replaced by `/kb/[kbSlug]/articles/`
- `apps/web/app/(main)/categories/` — Replaced by `/kb/[kbSlug]/categories/`
- `apps/web/app/(main)/search/` — Replaced by `/kb/[kbSlug]/search/`
- `apps/web/app/(main)/admin/tags/` — Replaced by `/kb/[kbSlug]/admin/tags/`
- `apps/web/app/(main)/admin/import/` — Replaced by `/kb/[kbSlug]/admin/import/`

---

## Phase 1: Foundation

### Task 1: Database Schema — New Tables

**Files:**
- Modify: `packages/db/src/schema.ts`

- [ ] **Step 1: Add `knowledgeBases` table**

After the `statusEnum` definition (~line 21), add:

```typescript
// -- Knowledge Bases --

export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 2: Add `userKbRoles` table**

After the `userCategoryRoles` table (~line 68), add:

```typescript
export const userKbRoles = pgTable(
  'user_kb_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.knowledgeBaseId] })],
);
```

- [ ] **Step 3: Add `apiKeyKnowledgeBases` junction table**

After the `apiKeys` table (~line 119), add:

```typescript
export const apiKeyKnowledgeBases = pgTable(
  'api_key_knowledge_bases',
  {
    apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
    knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.apiKeyId, t.knowledgeBaseId] })],
);
```

- [ ] **Step 4: Add `knowledgeBaseId` to `categories`**

Modify the `categories` table to add the FK column and update the unique index:

```typescript
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
```

- [ ] **Step 5: Add `knowledgeBaseId` to `tags`**

Replace the `tags` table:

```typescript
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => knowledgeBases.id),
}, (t) => [
  uniqueIndex('tags_slug_kb_unique').on(t.slug, t.knowledgeBaseId),
  uniqueIndex('tags_name_kb_unique').on(t.name, t.knowledgeBaseId),
]);
```

- [ ] **Step 6: Add `knowledgeBaseId` to `importJobs`**

Add the column to the `importJobs` table:

```typescript
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
```

- [ ] **Step 7: Add relations for new tables**

Add these after the existing relations block:

```typescript
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
```

Update existing relations to include KB references:

```typescript
// Update categoriesRelations to include knowledgeBase
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: 'categoryParent' }),
  children: many(categories, { relationName: 'categoryParent' }),
  knowledgeBase: one(knowledgeBases, { fields: [categories.knowledgeBaseId], references: [knowledgeBases.id] }),
  articles: many(articles),
  userRoles: many(userCategoryRoles),
}));

// Update tagsRelations to include knowledgeBase
export const tagsRelations = relations(tags, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases, { fields: [tags.knowledgeBaseId], references: [knowledgeBases.id] }),
  articleTags: many(articleTags),
}));

// Update usersRelations to include kbRoles
export const usersRelations = relations(users, ({ many }) => ({
  articles: many(articles),
  articleVersions: many(articleVersions),
  apiKeys: many(apiKeys),
  categoryRoles: many(userCategoryRoles),
  kbRoles: many(userKbRoles),
  importJobs: many(importJobs),
}));

// Update apiKeysRelations to include kbAssociations
export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  createdByUser: one(users, { fields: [apiKeys.createdBy], references: [users.id] }),
  knowledgeBases: many(apiKeyKnowledgeBases),
}));

// Update importJobsRelations to include knowledgeBase
export const importJobsRelations = relations(importJobs, ({ one }) => ({
  createdByUser: one(users, { fields: [importJobs.createdBy], references: [users.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [importJobs.knowledgeBaseId], references: [knowledgeBases.id] }),
}));
```

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): add knowledge base tables and FK columns to schema"
```

---

### Task 2: Shared Types

**Files:**
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add new interfaces and update existing ones**

Add after the existing interfaces:

```typescript
export interface KnowledgeBase {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
}

export interface UserKbRole {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  role: Role;
}
```

Update the `Category` interface to include `knowledgeBaseId`:

```typescript
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  knowledgeBaseId: string;
  createdAt: Date;
}
```

Update the `Tag` interface:

```typescript
export interface Tag {
  id: string;
  name: string;
  slug: string;
  knowledgeBaseId: string;
}
```

Update the `Article` interface to include optional `knowledgeBaseSlug`:

```typescript
export interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryPath?: string[];
  knowledgeBaseSlug?: string;
  authorId: string;
  content: unknown;
  status: ArticleStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add KnowledgeBase, UserKbRole interfaces; update Category, Tag, Article"
```

---

### Task 3: Database Migration

**Files:**
- Generate: `packages/db/drizzle/` (new migration file)

- [ ] **Step 1: Generate migration from schema changes**

```bash
cd packages/db && pnpm db:generate
```

Expected: Drizzle generates a migration SQL file in `packages/db/drizzle/`.

- [ ] **Step 2: Review and augment migration with backfill**

The auto-generated migration will try to add NOT NULL columns without defaults, which will fail on existing data. Edit the generated migration file to:

1. Create the new tables (`knowledge_bases`, `user_kb_roles`, `api_key_knowledge_bases`) first
2. Insert the Default KB
3. Add the FK columns as NULLABLE first
4. Backfill existing rows
5. Set NOT NULL constraints
6. Update unique indexes

The migration should contain these SQL statements (in order, after the auto-generated table creates):

```sql
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
```

- [ ] **Step 3: Run migration**

```bash
cd packages/db && pnpm db:migrate
```

Expected: Migration applies cleanly. Verify with `pnpm db:studio`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/
git commit -m "feat(db): migration for knowledge base tables with default KB backfill"
```

---

## Phase 2: API Core

### Task 4: resolveKb Middleware + requireKbAdmin Helper

**Files:**
- Create: `apps/api/src/middleware/resolveKb.ts`
- Create: `apps/api/src/__tests__/middleware/resolveKb.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/middleware/resolveKb.test.ts
import { describe, expect, it, vi, type Mock, beforeEach } from 'vitest';
import express, { type Request, type Response } from 'express';
import supertest from 'supertest';
import { createChain } from '../helpers/db-mock.js';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { db } from '@dovetail/db';
import { resolveKb, type KbRequest } from '../../middleware/resolveKb.js';

function buildApp() {
  const app = express();
  app.get('/api/knowledge-bases/:kbId/test', resolveKb, (req: KbRequest, res: Response) => {
    res.json({ kbId: req.kb!.id, kbName: req.kb!.name });
  });
  return app;
}

describe('resolveKb middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches KB to request when valid kbId', async () => {
    const mockKb = { id: 'kb-1', name: 'Test KB', slug: 'test-kb', description: null, createdAt: new Date() };
    (db.select as Mock).mockReturnValue(createChain([mockKb]));

    const res = await supertest(buildApp()).get('/api/knowledge-bases/kb-1/test');
    expect(res.status).toBe(200);
    expect(res.body.kbId).toBe('kb-1');
  });

  it('returns 404 when KB not found', async () => {
    (db.select as Mock).mockReturnValue(createChain([]));

    const res = await supertest(buildApp()).get('/api/knowledge-bases/nonexistent/test');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Knowledge base not found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm vitest run src/__tests__/middleware/resolveKb.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement resolveKb middleware**

```typescript
// apps/api/src/middleware/resolveKb.ts
import { type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, knowledgeBases } from '@dovetail/db';
import type { KnowledgeBase } from '@dovetail/types';

export interface KbRequest extends Request {
  kb?: KnowledgeBase;
}

export async function resolveKb(req: KbRequest, res: Response, next: NextFunction) {
  const kbId = req.params.kbId;
  if (!kbId) {
    res.status(400).json({ error: 'Missing knowledge base ID' });
    return;
  }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  if (!kb) {
    res.status(404).json({ error: 'Knowledge base not found' });
    return;
  }

  req.kb = kb;
  next();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm vitest run src/__tests__/middleware/resolveKb.test.ts
```

Expected: PASS

- [ ] **Step 5: Add requireKbAdmin helper to resolveKb.ts**

This helper checks if a user is a global admin OR has `admin` role for the specific KB. Used by KB management routes (user roles, tags, import, PATCH KB).

```typescript
// Append to apps/api/src/middleware/resolveKb.ts
import { sql } from 'drizzle-orm';
import type { Role } from '@dovetail/types';
import { hasMinimumRole } from '../services/permissions.js';

export interface AuthKbRequest extends KbRequest {
  user?: { id: string; role: string };
}

/**
 * Middleware that requires the user to be a global admin OR a KB-level admin for the current KB.
 * Must be used after both authMiddleware and resolveKb.
 */
export function requireKbAdmin(req: AuthKbRequest, res: Response, next: NextFunction) {
  const userRole = req.user?.role as Role | undefined;
  if (!userRole) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Global admins always pass
  if (hasMinimumRole(userRole, 'admin')) {
    next();
    return;
  }

  // Check KB-level admin role
  const kbId = req.kb?.id;
  if (!kbId || !req.user?.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  db.execute(sql`
    SELECT role FROM user_kb_roles
    WHERE user_id = ${req.user.id} AND knowledge_base_id = ${kbId}
    LIMIT 1
  `).then((result) => {
    if (result.length > 0 && result[0].role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  }).catch(() => {
    res.status(500).json({ error: 'Internal server error' });
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/resolveKb.ts apps/api/src/__tests__/middleware/resolveKb.test.ts
git commit -m "feat(api): add resolveKb middleware and requireKbAdmin helper"
```

---

### Task 5: Permissions Service — Three-Tier RBAC

**Files:**
- Modify: `apps/api/src/services/permissions.ts`
- Create: `apps/api/src/__tests__/services/permissions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/__tests__/services/permissions.test.ts
import { describe, expect, it, vi, type Mock, beforeEach } from 'vitest';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { db } from '@dovetail/db';
import { resolveRole, hasMinimumRole } from '../../services/permissions.js';

describe('resolveRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns category role when one exists (most specific wins)', async () => {
    // First execute call: category ancestor CTE returns a role
    (db.execute as Mock).mockResolvedValueOnce([{ role: 'editor' }]);

    const role = await resolveRole('user-1', 'cat-1', 'kb-1', 'viewer');
    expect(role).toBe('editor');
  });

  it('falls back to KB role when no category role exists', async () => {
    // First execute: no category role found
    (db.execute as Mock).mockResolvedValueOnce([]);
    // Second execute: KB role found
    (db.execute as Mock).mockResolvedValueOnce([{ role: 'admin' }]);

    const role = await resolveRole('user-1', 'cat-1', 'kb-1', 'viewer');
    expect(role).toBe('admin');
  });

  it('falls back to global role when no category or KB role exists', async () => {
    (db.execute as Mock).mockResolvedValueOnce([]);
    (db.execute as Mock).mockResolvedValueOnce([]);

    const role = await resolveRole('user-1', 'cat-1', 'kb-1', 'viewer');
    expect(role).toBe('viewer');
  });

  it('works without knowledgeBaseId (backwards compat)', async () => {
    (db.execute as Mock).mockResolvedValueOnce([]);

    const role = await resolveRole('user-1', 'cat-1', undefined, 'editor');
    expect(role).toBe('editor');
    // Should only make one execute call (category CTE), skip KB lookup
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});

describe('hasMinimumRole', () => {
  it('viewer >= viewer', () => expect(hasMinimumRole('viewer', 'viewer')).toBe(true));
  it('viewer < editor', () => expect(hasMinimumRole('viewer', 'editor')).toBe(false));
  it('admin >= editor', () => expect(hasMinimumRole('admin', 'editor')).toBe(true));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm vitest run src/__tests__/services/permissions.test.ts
```

Expected: FAIL — resolveRole signature mismatch (3 args vs 4)

- [ ] **Step 3: Update resolveRole to support three-tier RBAC**

Replace `apps/api/src/services/permissions.ts`:

```typescript
import { db } from '@dovetail/db';
import { sql } from 'drizzle-orm';
import type { Role } from '@dovetail/types';

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/**
 * Resolve the effective role for a user in a given context.
 * Three-tier cascade: category role → KB role → global role.
 * Most-specific wins.
 */
export async function resolveRole(
  userId: string,
  categoryId: string,
  knowledgeBaseId: string | undefined,
  globalRole: Role,
): Promise<Role> {
  // 1. Check category-level roles (walk ancestor chain)
  const categoryResult = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 0 AS depth
      FROM categories
      WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c.parent_id, a.depth + 1
      FROM categories c
      INNER JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT ucr.role
    FROM ancestors a
    INNER JOIN user_category_roles ucr
      ON ucr.category_id = a.id AND ucr.user_id = ${userId}
    ORDER BY a.depth ASC
    LIMIT 1
  `);

  if (categoryResult.length > 0) {
    return categoryResult[0].role as Role;
  }

  // 2. Check KB-level role (if knowledgeBaseId provided)
  if (knowledgeBaseId) {
    const kbResult = await db.execute(sql`
      SELECT role FROM user_kb_roles
      WHERE user_id = ${userId} AND knowledge_base_id = ${knowledgeBaseId}
      LIMIT 1
    `);

    if (kbResult.length > 0) {
      return kbResult[0].role as Role;
    }
  }

  // 3. Fall back to global role
  return globalRole;
}

export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm vitest run src/__tests__/services/permissions.test.ts
```

Expected: PASS

- [ ] **Step 5: Update callers of resolveRole**

Find all callers and add the `knowledgeBaseId` parameter. The callers are in:

`apps/api/src/routes/articles.ts` line 175 — article PATCH handler:
```typescript
// Before:
const effectiveRole = await resolveRole(req.user!.id, current.categoryId, req.user!.role as Role);
// After:
const effectiveRole = await resolveRole(req.user!.id, current.categoryId, req.kb?.id, req.user!.role as Role);
```

`apps/api/src/routes/me.ts` line 16 — effective-role endpoint:
```typescript
// Before:
const role = await resolveRole(req.user!.id, categoryId, req.user!.role as Role);
// After:
const { categoryId, knowledgeBaseId } = res.locals.query as z.infer<typeof effectiveRoleQuery>;
const role = await resolveRole(req.user!.id, categoryId, knowledgeBaseId, req.user!.role as Role);
```

Also update the query schema in `me.ts`:
```typescript
const effectiveRoleQuery = z.object({
  categoryId: z.string().uuid(),
  knowledgeBaseId: z.string().uuid().optional(),
});
```

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd apps/api && pnpm test
```

Expected: All existing tests pass (callers pass `undefined` for knowledgeBaseId which triggers the backwards-compatible path).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/permissions.ts apps/api/src/__tests__/services/permissions.test.ts apps/api/src/routes/articles.ts apps/api/src/routes/me.ts
git commit -m "feat(api): three-tier RBAC — global, KB, and category role resolution"
```

---

### Task 6: KB CRUD Routes

**Files:**
- Create: `apps/api/src/routes/knowledge-bases.ts`
- Create: `apps/api/src/__tests__/routes/knowledge-bases.test.ts`

- [ ] **Step 1: Write failing tests for KB CRUD**

```typescript
// apps/api/src/__tests__/routes/knowledge-bases.test.ts
import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../helpers/token.js';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { app } from '../../app.js';
import { db } from '@dovetail/db';

describe('Knowledge Base routes', () => {
  let viewerToken: string;
  let editorToken: string;
  let adminToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
    adminToken = await makeToken({ sub: 'user-3', role: 'admin' });
  });

  describe('GET /api/knowledge-bases', () => {
    it('returns 401 without auth', async () => {
      const res = await supertest(app).get('/api/knowledge-bases');
      expect(res.status).toBe(401);
    });

    it('returns list of KBs for any authenticated user', async () => {
      const mockKbs = [{ id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() }];
      (db.select as Mock).mockReturnValue(createChain(mockKbs));

      const res = await supertest(app)
        .get('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Default');
    });
  });

  describe('POST /api/knowledge-bases', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .post('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ name: 'New KB' });
      expect(res.status).toBe(403);
    });

    it('creates a KB for admin', async () => {
      const created = { id: 'kb-new', name: 'Housing Law', slug: 'housing-law', description: null, createdAt: new Date() };
      (db.insert as Mock).mockReturnValue(createChain([created]));

      const res = await supertest(app)
        .post('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Housing Law' });

      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('housing-law');
    });
  });

  describe('GET /api/knowledge-bases/:id', () => {
    it('returns KB details', async () => {
      const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };
      (db.select as Mock).mockReturnValue(createChain([mockKb]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Default');
    });

    it('returns 404 when not found', async () => {
      (db.select as Mock).mockReturnValue(createChain([]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/knowledge-bases/:id', () => {
    it('updates KB for admin', async () => {
      const updated = { id: 'kb-1', name: 'Updated', slug: 'updated', description: 'desc', createdAt: new Date() };
      (db.update as Mock).mockReturnValue(createChain([updated]));

      const res = await supertest(app)
        .patch('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Updated', description: 'desc' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/knowledge-bases/:id', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 409 when KB has categories', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([{ count: 1 }]));

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('deletes KB when empty', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([{ count: 0 }]));
      (db.delete as Mock).mockReturnValue(createChain(undefined));

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(204);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/knowledge-bases.test.ts
```

Expected: FAIL — route not mounted

- [ ] **Step 3: Implement KB CRUD routes**

```typescript
// apps/api/src/routes/knowledge-bases.ts
import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, knowledgeBases, categories } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';

export const knowledgeBasesRouter: Router = Router();

const createKbSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

const updateKbSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

// GET /api/knowledge-bases — list all KBs
knowledgeBasesRouter.get('/', authMiddleware, async (_req, res) => {
  const result = await db.select().from(knowledgeBases);
  res.json(result);
});

// POST /api/knowledge-bases — create KB (global admin only)
knowledgeBasesRouter.post(
  '/',
  authMiddleware,
  requireRole('admin'),
  validateBody(createKbSchema),
  async (req, res) => {
    const { name, description } = req.body;
    const slug = toSlug(name);
    try {
      const [created] = await db.insert(knowledgeBases).values({ name, slug, description: description ?? null }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name?.includes('slug')) {
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
        const [created] = await db.insert(knowledgeBases).values({ name, slug: uniqueSlug, description: description ?? null }).returning();
        res.status(201).json(created);
      } else {
        throw err;
      }
    }
  },
);

// GET /api/knowledge-bases/:id — single KB
knowledgeBasesRouter.get('/:id', authMiddleware, async (req, res) => {
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, req.params.id as string));
  if (!kb) {
    res.status(404).json({ error: 'Knowledge base not found' });
    return;
  }
  res.json(kb);
});

// PATCH /api/knowledge-bases/:id — update KB (global admin or KB admin)
// Note: This route is self-referential — :id IS the KB.
// resolveKb expects :kbId, so we use inline KB lookup + requireKbAdmin logic here.
knowledgeBasesRouter.patch(
  '/:id',
  authMiddleware,
  requireRole('admin'), // Global admin check; KB-admin check added in Task 7 step 3
  validateBody(updateKbSchema),
  async (req, res) => {
    const id = req.params.id as string;
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) {
      updates.name = req.body.name;
      updates.slug = toSlug(req.body.name);
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description;
    }

    const [updated] = await db.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: 'Knowledge base not found' });
      return;
    }
    res.json(updated);
  },
);

// DELETE /api/knowledge-bases/:id — delete KB (global admin only, fails if has categories)
knowledgeBasesRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const id = req.params.id as string;

  const [catCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.knowledgeBaseId, id));

  if (Number(catCount.count) > 0) {
    res.status(409).json({ error: 'Cannot delete knowledge base with categories. Remove all categories first.' });
    return;
  }

  await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id));
  res.status(204).end();
});
```

- [ ] **Step 4: Mount routes in app.ts**

Add to `apps/api/src/app.ts` after the existing imports:

```typescript
import { knowledgeBasesRouter } from './routes/knowledge-bases.js';
app.use('/api/knowledge-bases', knowledgeBasesRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/knowledge-bases.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/knowledge-bases.ts apps/api/src/__tests__/routes/knowledge-bases.test.ts apps/api/src/app.ts
git commit -m "feat(api): add knowledge base CRUD routes"
```

---

### Task 7: KB User Role Management Routes

**Files:**
- Modify: `apps/api/src/routes/knowledge-bases.ts`
- Modify: `apps/api/src/__tests__/routes/knowledge-bases.test.ts`

- [ ] **Step 1: Write failing tests for KB role routes**

Add to the existing test file:

```typescript
describe('KB User Role routes', () => {
  describe('GET /api/knowledge-bases/:kbId/users', () => {
    it('returns 403 for viewer', async () => {
      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/users')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
      expect(res.status).toBe(403);
    });

    it('returns user list with KB roles for admin', async () => {
      const mockUsers = [
        { userId: 'user-1', email: 'a@test.com', name: 'A', role: 'editor', knowledgeBaseId: 'kb-1' },
      ];
      (db.execute as Mock).mockResolvedValueOnce(mockUsers);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/users')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/knowledge-bases/:kbId/users/:userId', () => {
    it('sets KB role for user', async () => {
      (db.insert as Mock).mockReturnValue(createChain([{ userId: 'user-1', knowledgeBaseId: 'kb-1', role: 'editor' }]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/users/user-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ role: 'editor' });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/knowledge-bases/:kbId/users/:userId', () => {
    it('removes KB role', async () => {
      (db.delete as Mock).mockReturnValue(createChain(undefined));

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1/users/user-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(204);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/knowledge-bases.test.ts
```

Expected: FAIL — routes not implemented

- [ ] **Step 3: Add role management routes to knowledge-bases.ts**

Append to `apps/api/src/routes/knowledge-bases.ts`:

```typescript
import { userKbRoles, users } from '@dovetail/db';
import { resolveKb, requireKbAdmin } from '../middleware/resolveKb.js';

const setKbRoleSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin']),
});

// GET /api/knowledge-bases/:kbId/users — list users with KB roles (global admin or KB admin)
knowledgeBasesRouter.get('/:kbId/users', authMiddleware, resolveKb, requireKbAdmin, async (req, res) => {
  const kbId = req.params.kbId as string;

  const result = await db.execute(sql`
    SELECT u.id AS "userId", u.email, u.name, u.avatar_url AS "avatarUrl",
           u.role AS "globalRole", ukr.role AS "kbRole"
    FROM users u
    LEFT JOIN user_kb_roles ukr ON ukr.user_id = u.id AND ukr.knowledge_base_id = ${kbId}
    ORDER BY u.name ASC
  `);

  res.json(result);
});

// POST /api/knowledge-bases/:kbId/users/:userId — set KB role (global admin or KB admin)
knowledgeBasesRouter.post(
  '/:kbId/users/:userId',
  authMiddleware,
  resolveKb,
  requireKbAdmin,
  validateBody(setKbRoleSchema),
  async (req, res) => {
    const { kbId, userId } = req.params as { kbId: string; userId: string };
    const { role } = req.body;

    const [result] = await db
      .insert(userKbRoles)
      .values({ userId, knowledgeBaseId: kbId, role })
      .onConflictDoUpdate({
        target: [userKbRoles.userId, userKbRoles.knowledgeBaseId],
        set: { role },
      })
      .returning();

    res.json(result);
  },
);

// DELETE /api/knowledge-bases/:kbId/users/:userId — remove KB role (global admin or KB admin)
knowledgeBasesRouter.delete('/:kbId/users/:userId', authMiddleware, resolveKb, requireKbAdmin, async (req, res) => {
  const { kbId, userId } = req.params as { kbId: string; userId: string };

  await db.delete(userKbRoles).where(
    sql`${userKbRoles.userId} = ${userId} AND ${userKbRoles.knowledgeBaseId} = ${kbId}`,
  );

  res.status(204).end();
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/knowledge-bases.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/knowledge-bases.ts apps/api/src/__tests__/routes/knowledge-bases.test.ts
git commit -m "feat(api): add KB user role management routes"
```

---

## Phase 3: API Route Scoping

### Task 8: Update category-path Utility

**Files:**
- Modify: `apps/api/src/utils/category-path.ts`

- [ ] **Step 1: Add `knowledgeBaseId` parameter to `resolveCategoryPath`**

The function needs to scope root category lookups to a specific KB:

```typescript
import { type SQL, sql } from 'drizzle-orm';
import { db, categories } from '@dovetail/db';

/**
 * Resolve a category path like ["housing", "rental"] to the final category ID.
 * Scoped to a specific knowledge base.
 */
export async function resolveCategoryPath(slugSegments: string[], knowledgeBaseId?: string): Promise<string | null> {
  if (slugSegments.length === 0) return null;

  let parentId: string | null = null;

  for (const slug of slugSegments) {
    const parentCondition: SQL = parentId
      ? sql`${categories.parentId} = ${parentId}`
      : sql`${categories.parentId} IS NULL`;

    const kbCondition: SQL = knowledgeBaseId
      ? sql`AND ${categories.knowledgeBaseId} = ${knowledgeBaseId}`
      : sql``;

    const result: any[] = await db.execute(sql`
      SELECT ${categories.id}
      FROM ${categories}
      WHERE ${categories.slug} = ${slug}
        AND ${parentCondition}
        ${kbCondition}
      LIMIT 1
    `);

    if ((result as any[]).length === 0) return null;
    parentId = (result as any[])[0].id;
  }

  return parentId;
}

/**
 * Build the full category slug path from a given category ID.
 * Unchanged — walks up parent chain which is inherently scoped to one KB.
 */
export async function buildCategoryPath(categoryId: string): Promise<string[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, slug, parent_id, 0 AS depth
      FROM ${categories}
      WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c.slug, c.parent_id, a.depth + 1
      FROM ${categories} c
      INNER JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT slug, depth FROM ancestors
    ORDER BY depth DESC
  `);

  return (result as any[]).map((r) => r.slug);
}
```

- [ ] **Step 2: Update callers to pass knowledgeBaseId**

In `apps/api/src/routes/articles.ts`, the `by-path` handler (line 88):
```typescript
// Before:
const categoryId = await resolveCategoryPath(categorySegments);
// After:
const categoryId = await resolveCategoryPath(categorySegments, req.kb?.id);
```

This will be fully wired once the articles router gets `mergeParams` in Task 10.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/utils/category-path.ts apps/api/src/routes/articles.ts
git commit -m "feat(api): scope resolveCategoryPath to knowledge base"
```

---

### Task 9: KB-Scoped Category Routes

**Files:**
- Modify: `apps/api/src/routes/categories.ts`
- Modify: `apps/api/src/__tests__/routes/categories.test.ts`

- [ ] **Step 1: Update categories router to use mergeParams and scope to KB**

Replace `apps/api/src/routes/categories.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db, categories, articles } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';
import type { KbRequest } from '../middleware/resolveKb.js';

export const categoriesRouter: Router = Router({ mergeParams: true });

const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

// GET /api/knowledge-bases/:kbId/categories
categoriesRouter.get('/', authMiddleware, async (req: KbRequest, res) => {
  const kbId = req.params.kbId as string;
  const result = await db.select().from(categories).where(eq(categories.knowledgeBaseId, kbId));
  res.json(result);
});

// POST /api/knowledge-bases/:kbId/categories
categoriesRouter.post(
  '/',
  authMiddleware,
  requireRole('editor'),
  validateBody(createCategorySchema),
  async (req: KbRequest, res) => {
    const kbId = req.params.kbId as string;
    const { name, parentId } = req.body;
    const slug = toSlug(name);
    try {
      const [created] = await db.insert(categories).values({
        name, slug, parentId: parentId ?? null, knowledgeBaseId: kbId,
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name?.includes('slug')) {
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
        const [created] = await db.insert(categories).values({
          name, slug: uniqueSlug, parentId: parentId ?? null, knowledgeBaseId: kbId,
        }).returning();
        res.status(201).json(created);
      } else {
        throw err;
      }
    }
  },
);

// PATCH /api/knowledge-bases/:kbId/categories/:id
categoriesRouter.patch(
  '/:id',
  authMiddleware,
  requireRole('editor'),
  validateBody(updateCategorySchema),
  async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) {
      updates.name = req.body.name;
      updates.slug = toSlug(req.body.name);
    }
    if (req.body.parentId !== undefined) {
      updates.parentId = req.body.parentId;
    }

    const [updated] = await db.update(categories).set(updates).where(eq(categories.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(updated);
  },
);

// DELETE /api/knowledge-bases/:kbId/categories/:id
categoriesRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const id = req.params.id as string;

  const [childCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.parentId, id));
  if (Number(childCount.count) > 0) {
    res.status(409).json({ error: 'Cannot delete category with subcategories. Move or delete them first.' });
    return;
  }

  const [articleCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(eq(articles.categoryId, id));
  if (Number(articleCount.count) > 0) {
    res.status(409).json({ error: 'Cannot delete category with articles. Move or delete them first.' });
    return;
  }

  await db.delete(categories).where(eq(categories.id, id));
  res.status(204).end();
});
```

- [ ] **Step 2: Update category tests for new route prefix**

In `apps/api/src/__tests__/routes/categories.test.ts`, update all route paths from `/api/categories` to `/api/knowledge-bases/kb-1/categories`. For example:

```typescript
// Before:
const res = await supertest(app).get('/api/categories');
// After:
const res = await supertest(app).get('/api/knowledge-bases/kb-1/categories');
```

Also mock the `resolveKb` middleware's DB call. Add at the top of the beforeEach:

```typescript
// Mock resolveKb — return a valid KB for all requests with kbId
const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };
```

And in each test that calls the route, add a first mock for the KB lookup:

```typescript
(db.select as Mock).mockReturnValueOnce(createChain([mockKb])); // resolveKb
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/categories.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/categories.ts apps/api/src/__tests__/routes/categories.test.ts
git commit -m "feat(api): scope category routes to knowledge base"
```

---

### Task 10: KB-Scoped Article Routes

**Files:**
- Modify: `apps/api/src/routes/articles.ts`
- Modify: `apps/api/src/__tests__/routes/articles.test.ts`

- [ ] **Step 1: Update articles router to use mergeParams**

Change the Router declaration:

```typescript
export const articlesRouter: Router = Router({ mergeParams: true });
```

- [ ] **Step 2: Scope article list to KB**

In the `GET /` handler, add a KB filter. After building conditions, add:

```typescript
const kbId = req.params.kbId as string | undefined;
// If mounted under a KB, filter articles by KB through categories
if (kbId) {
  conditions.push(
    inArray(articles.categoryId, sql`(SELECT id FROM categories WHERE knowledge_base_id = ${kbId})`),
  );
}
```

Add `inArray` to the drizzle-orm import.

- [ ] **Step 3: Update article by-path to pass KB context**

In the `GET /by-path/*` handler:

```typescript
const kbId = req.params.kbId as string | undefined;
const categoryId = await resolveCategoryPath(categorySegments, kbId);
```

- [ ] **Step 4: Add KB slug to article responses**

Add a helper near the top of the file to enrich articles with KB slug:

```typescript
import { knowledgeBases } from '@dovetail/db';

async function enrichWithKbSlug(article: any, categoryKbId?: string): Promise<any> {
  if (!categoryKbId) return article;
  const [kb] = await db.select({ slug: knowledgeBases.slug }).from(knowledgeBases).where(eq(knowledgeBases.id, categoryKbId));
  return { ...article, knowledgeBaseSlug: kb?.slug };
}
```

Use it when building responses (in GET /:id, GET /by-path, POST /, PATCH /:id handlers).

- [ ] **Step 5: Update PATCH handler to pass KB context to resolveRole**

In the PATCH handler, after fetching the current article, get the KB:

```typescript
// Get KB from the category
const [cat] = await tx.select({ knowledgeBaseId: categories.knowledgeBaseId })
  .from(categories)
  .where(eq(categories.id, current.categoryId));

const effectiveRole = await resolveRole(
  req.user!.id, current.categoryId, cat?.knowledgeBaseId, req.user!.role as Role,
);
```

Add `categories` to the `@dovetail/db` import.

- [ ] **Step 6: Update article tests for new route prefix**

In `apps/api/src/__tests__/routes/articles.test.ts`, update all paths from `/api/articles` to `/api/knowledge-bases/kb-1/articles`. Mock the resolveKb DB call as in Task 9 Step 2.

- [ ] **Step 7: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/articles.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/articles.ts apps/api/src/__tests__/routes/articles.test.ts
git commit -m "feat(api): scope article routes to knowledge base"
```

---

### Task 11: KB-Scoped Tag Routes

**Files:**
- Modify: `apps/api/src/routes/tags.ts`
- Modify: `apps/api/src/__tests__/routes/tags.test.ts`

- [ ] **Step 1: Update tags router**

Change Router to use mergeParams and scope queries to KB:

```typescript
export const tagsRouter: Router = Router({ mergeParams: true });
```

Update GET `/` to filter by KB:

```typescript
tagsRouter.get('/', authMiddleware, async (req, res) => {
  const kbId = req.params.kbId as string;
  const result = await db.select().from(tags).where(eq(tags.knowledgeBaseId, kbId));
  res.json(result);
});
```

Update POST `/` to include KB:

```typescript
const [created] = await db.insert(tags).values({ name, slug, knowledgeBaseId: kbId }).returning();
```

(Also update the slug conflict retry path.)

The `articleTagsRouter` stays unchanged — it operates on article-tag associations which are KB-independent.

- [ ] **Step 2: Update tag tests for new route prefix**

Change `/api/tags` to `/api/knowledge-bases/kb-1/tags`. Mock resolveKb.

- [ ] **Step 3: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/tags.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/tags.ts apps/api/src/__tests__/routes/tags.test.ts
git commit -m "feat(api): scope tag routes to knowledge base"
```

---

### Task 12: KB-Scoped Search Routes

**Files:**
- Modify: `apps/api/src/routes/search.ts`
- Modify: `apps/api/src/__tests__/routes/search.test.ts`

- [ ] **Step 1: Update search router to mergeParams and scope to KB**

```typescript
export const searchRouter: Router = Router({ mergeParams: true });
```

Update `buildFilterConditions` to accept `knowledgeBaseId`:

```typescript
function buildFilterConditions(params: {
  knowledgeBaseId: string;
  categoryId?: string;
  authorId?: string;
  from?: string;
  to?: string;
  tags?: string;
}) {
  const conditions: ReturnType<typeof eq>[] = [];
  conditions.push(eq(articles.status, 'published'));
  // Scope to KB via categories
  conditions.push(
    inArray(articles.categoryId, sql`(SELECT id FROM categories WHERE knowledge_base_id = ${params.knowledgeBaseId})`),
  );
  if (params.categoryId) conditions.push(eq(articles.categoryId, params.categoryId));
  // ... rest unchanged
}
```

Add `inArray` to drizzle-orm imports.

Update `semanticSearch` to accept and use `knowledgeBaseId`:

```typescript
async function semanticSearch(q: string, limit: number, knowledgeBaseId: string, categoryId?: string) {
  // ...
  const kbFilter = sql`AND a.category_id IN (SELECT id FROM categories WHERE knowledge_base_id = ${knowledgeBaseId})`;
  const categoryFilter = categoryId
    ? sql`AND a.category_id = ${categoryId}`
    : sql``;

  const results = await db.execute(sql`
    SELECT ae.article_id, ae.chunk_text,
           1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
           a.title, a.slug, a.category_id, a.author_id,
           a.status, a.created_at, a.updated_at
    FROM article_embeddings ae
    JOIN articles a ON a.id = ae.article_id
    WHERE a.status = 'published' ${kbFilter} ${categoryFilter}
    ORDER BY ae.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);
  // ... rest unchanged
}
```

Update the main handler to pass `kbId`:

```typescript
searchRouter.get('/', authMiddleware, validateQuery(searchQuerySchema), async (req, res) => {
  const kbId = req.params.kbId as string;
  const { q, mode, categoryId, authorId, from, to, tags: tagFilter, page, limit } = res.locals.query;
  const offset = (page - 1) * limit;

  if (mode === 'fulltext') {
    const conditions = buildFilterConditions({ knowledgeBaseId: kbId, categoryId, authorId, from, to, tags: tagFilter });
    const { data, total } = await fulltextSearch(q, conditions, limit, offset);
    res.json(paginate(data, total, { page, limit }));
    return;
  }

  if (mode === 'semantic') {
    const results = await semanticSearch(q, limit, kbId, categoryId);
    res.json(paginate(results, results.length, { page, limit }));
    return;
  }

  // hybrid
  const conditions = buildFilterConditions({ knowledgeBaseId: kbId, categoryId, authorId, from, to, tags: tagFilter });
  const [fulltextResult, semanticResults] = await Promise.all([
    fulltextSearch(q, conditions, limit, offset),
    semanticSearch(q, limit, kbId, categoryId),
  ]);
  // ... rest unchanged
});
```

- [ ] **Step 2: Update search tests**

Change `/api/search` to `/api/knowledge-bases/kb-1/search`. Mock resolveKb.

- [ ] **Step 3: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/search.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/search.ts apps/api/src/__tests__/routes/search.test.ts
git commit -m "feat(api): scope search to knowledge base"
```

---

### Task 13: KB-Scoped RAG + API Key Validation

**Files:**
- Modify: `apps/api/src/routes/rag.ts`
- Modify: `apps/api/src/middleware/apiKeyAuth.ts`
- Modify: `apps/api/src/__tests__/routes/rag.test.ts`

- [ ] **Step 1: Update apiKeyAuth to attach allowed KB IDs**

In `apps/api/src/middleware/apiKeyAuth.ts`, after validating the API key, fetch the associated KBs:

```typescript
import { db, apiKeys, apiKeyKnowledgeBases } from '@dovetail/db';

export interface ApiKeyRequest extends Request {
  apiKeyId?: string;
  allowedKbIds?: string[];
}

// After looking up the key and setting req.apiKeyId:
const kbRows = await db.select({ knowledgeBaseId: apiKeyKnowledgeBases.knowledgeBaseId })
  .from(apiKeyKnowledgeBases)
  .where(eq(apiKeyKnowledgeBases.apiKeyId, key.id));
req.allowedKbIds = kbRows.map(r => r.knowledgeBaseId);
```

- [ ] **Step 2: Update RAG route to require and validate knowledgeBaseIds**

```typescript
const ragSearchSchema = z.object({
  query: z.string().min(1).max(5000),
  limit: z.number().int().min(1).max(50).default(5),
  knowledgeBaseIds: z.array(z.string().uuid()).min(1),
  categoryIds: z.array(z.string().uuid()).optional(),
});

ragRouter.post('/search', apiKeyAuth, validateBody(ragSearchSchema), async (req: ApiKeyRequest, res) => {
  const { query, limit, knowledgeBaseIds, categoryIds } = req.body;

  // Validate API key has access to requested KBs
  const unauthorized = knowledgeBaseIds.filter(id => !req.allowedKbIds?.includes(id));
  if (unauthorized.length > 0) {
    res.status(403).json({ error: 'API key does not have access to requested knowledge base(s)' });
    return;
  }

  const provider = createEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // Scope to KBs via categories
  const kbFilter = sql`AND a.category_id IN (SELECT id FROM categories WHERE knowledge_base_id = ANY(${knowledgeBaseIds}::uuid[]))`;
  const categoryFilter = categoryIds?.length
    ? sql`AND a.category_id = ANY(${categoryIds}::uuid[])`
    : sql``;

  const results = await db.execute(sql`
    SELECT ae.article_id, ae.chunk_text, ae.chunk_index,
           1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
           a.title, a.slug, a.category_id
    FROM article_embeddings ae
    JOIN articles a ON a.id = ae.article_id
    WHERE a.status = 'published' ${kbFilter} ${categoryFilter}
    ORDER BY ae.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  const formatted = await Promise.all(
    (results as any[]).map(async (r) => {
      const categoryPath = await buildCategoryPath(r.category_id);
      // Get KB slug for URL
      const [cat] = await db.select({ knowledgeBaseId: categories.knowledgeBaseId })
        .from(categories).where(eq(categories.id, r.category_id));
      const [kb] = cat ? await db.select({ slug: knowledgeBases.slug })
        .from(knowledgeBases).where(eq(knowledgeBases.id, cat.knowledgeBaseId)) : [null];

      return {
        articleId: r.article_id,
        articleTitle: r.title,
        articleUrl: `/kb/${kb?.slug ?? 'default'}/articles/${categoryPath.join('/')}/${r.slug}`,
        categoryPath,
        chunkText: r.chunk_text,
        score: parseFloat(r.similarity),
      };
    }),
  );

  res.json({ results: formatted });
});
```

Add imports: `import { categories, knowledgeBases } from '@dovetail/db';` and `import { eq } from 'drizzle-orm';`

- [ ] **Step 3: Update RAG tests**

Update the test to send `knowledgeBaseIds` instead of `categoryIds` at the top level. Mock the API key KB lookup.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/rag.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/rag.ts apps/api/src/middleware/apiKeyAuth.ts apps/api/src/__tests__/routes/rag.test.ts
git commit -m "feat(api): scope RAG search to knowledge bases with API key validation"
```

---

### Task 14: KB-Scoped Import

**Files:**
- Modify: `apps/api/src/routes/admin/import.ts`
- Modify: `apps/api/src/services/import/import-engine.ts`
- Modify: `apps/api/src/__tests__/routes/admin/import.test.ts`

- [ ] **Step 1: Update ImportEngine to accept knowledgeBaseId**

In `apps/api/src/services/import/import-engine.ts`:

Add to `ImportEngineOptions`:
```typescript
export interface ImportEngineOptions {
  extractDir: string;
  userId: string;
  defaultStatus: 'draft' | 'published';
  jobId: string;
  knowledgeBaseId: string;
}
```

Update `createCategories` to pass KB ID when inserting:
```typescript
const [created] = await db.insert(categories)
  .values({ name: node.name, slug, parentId, knowledgeBaseId: this.opts.knowledgeBaseId })
  .returning();
```

Also update the slug conflict retry:
```typescript
const [created] = await db.insert(categories)
  .values({ name: node.name, slug: uniqueSlug, parentId, knowledgeBaseId: this.opts.knowledgeBaseId })
  .returning();
```

And the existing category check needs KB scoping:
```typescript
const existing = await db.select()
  .from(categories)
  .where(
    parentId
      ? and(eq(categories.slug, slug), eq(categories.parentId, parentId), eq(categories.knowledgeBaseId, this.opts.knowledgeBaseId))
      : and(eq(categories.slug, slug), sql`${categories.parentId} IS NULL`, eq(categories.knowledgeBaseId, this.opts.knowledgeBaseId)),
  );
```

- [ ] **Step 2: Update import router to use mergeParams and pass kbId**

```typescript
export const importRouter: Router = Router({ mergeParams: true });
```

In the execute handler, pass KB ID:
```typescript
const kbId = req.params.kbId as string;

// Create import job with KB
const [job] = await db.insert(importJobs).values({
  createdBy: req.user!.id,
  knowledgeBaseId: kbId,
  options,
}).returning();

// Pass to engine
const engine = new ImportEngine({
  extractDir: session.dir,
  userId: req.user!.id,
  defaultStatus: options.defaultStatus,
  jobId: job.id,
  knowledgeBaseId: kbId,
});
```

- [ ] **Step 3: Update import tests**

Change route paths from `/api/admin/import` to `/api/knowledge-bases/kb-1/admin/import`. Mock resolveKb.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/admin/import.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/import.ts apps/api/src/services/import/import-engine.ts apps/api/src/__tests__/routes/admin/import.test.ts
git commit -m "feat(api): scope import to knowledge base"
```

---

### Task 15: API Key Create — KB Association

**Files:**
- Modify: `apps/api/src/routes/admin/api-keys.ts`
- Modify: `apps/api/src/__tests__/routes/admin/api-keys.test.ts`

- [ ] **Step 1: Update create key schema and handler**

Add `knowledgeBaseIds` to the create schema:

```typescript
const createKeySchema = z.object({
  name: z.string().min(1).max(200),
  knowledgeBaseIds: z.array(z.string().uuid()).min(1),
});
```

After creating the key, insert KB associations:

```typescript
import { apiKeyKnowledgeBases } from '@dovetail/db';

// After db.insert(apiKeys)...
const { knowledgeBaseIds } = req.body;
await db.insert(apiKeyKnowledgeBases).values(
  knowledgeBaseIds.map((kbId: string) => ({ apiKeyId: created.id, knowledgeBaseId: kbId })),
);
```

Update the GET handler to include associated KB IDs:

```typescript
apiKeysRouter.get('/', authMiddleware, requireRole('admin'), async (_req, res) => {
  const keys = await db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    createdBy: apiKeys.createdBy,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
    revokedAt: apiKeys.revokedAt,
  }).from(apiKeys);

  // Enrich with KB associations
  const enriched = await Promise.all(keys.map(async (key) => {
    const kbs = await db.select({ knowledgeBaseId: apiKeyKnowledgeBases.knowledgeBaseId })
      .from(apiKeyKnowledgeBases)
      .where(eq(apiKeyKnowledgeBases.apiKeyId, key.id));
    return { ...key, knowledgeBaseIds: kbs.map(kb => kb.knowledgeBaseId) };
  }));

  res.json(enriched);
});
```

- [ ] **Step 2: Update tests**

Update the create test to send `knowledgeBaseIds`. Add mock for the junction table insert.

- [ ] **Step 3: Run tests**

```bash
cd apps/api && pnpm vitest run src/__tests__/routes/admin/api-keys.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/admin/api-keys.ts apps/api/src/__tests__/routes/admin/api-keys.test.ts
git commit -m "feat(api): associate API keys with knowledge bases on creation"
```

---

### Task 16: Route Mounting Restructure

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/versions.ts` (add mergeParams)

- [ ] **Step 1: Update versions router to use mergeParams**

In `apps/api/src/routes/versions.ts`:
```typescript
export const versionsRouter: Router = Router({ mergeParams: true });
```

- [ ] **Step 2: Restructure app.ts route mounting**

Replace the route mounting section in `apps/api/src/app.ts`:

```typescript
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { authMiddleware, type AuthRequest } from './middleware/auth.js';
import { resolveKb } from './middleware/resolveKb.js';

export const app: ReturnType<typeof express> = express();

app.use(helmet());
app.use(cors({
  origin: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/me', authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});

import { meRouter } from './routes/me.js';
app.use('/api/me', meRouter);

// --- Knowledge Base routes ---
import { knowledgeBasesRouter } from './routes/knowledge-bases.js';
app.use('/api/knowledge-bases', knowledgeBasesRouter);

// --- KB-scoped content routes ---
import { categoriesRouter } from './routes/categories.js';
app.use('/api/knowledge-bases/:kbId/categories', resolveKb, categoriesRouter);

import { articlesRouter } from './routes/articles.js';
app.use('/api/knowledge-bases/:kbId/articles', resolveKb, articlesRouter);

import { versionsRouter } from './routes/versions.js';
app.use('/api/knowledge-bases/:kbId/articles/:id/versions', resolveKb, versionsRouter);

import { searchRouter } from './routes/search.js';
app.use('/api/knowledge-bases/:kbId/search', resolveKb, searchRouter);

import { tagsRouter, articleTagsRouter } from './routes/tags.js';
app.use('/api/knowledge-bases/:kbId/tags', resolveKb, tagsRouter);
app.use('/api/knowledge-bases/:kbId/articles/:id/tags', resolveKb, articleTagsRouter);

import { importRouter } from './routes/admin/import.js';
app.use('/api/knowledge-bases/:kbId/admin/import', resolveKb, importRouter);

import { bulkPublishRouter } from './routes/admin/bulk-publish.js';
app.use('/api/knowledge-bases/:kbId/admin/articles/bulk-publish', resolveKb, bulkPublishRouter);

// --- Global admin routes (not KB-scoped) ---
import { apiKeysRouter } from './routes/admin/api-keys.js';
app.use('/api/admin/api-keys', apiKeysRouter);

import { adminUsersRouter } from './routes/admin/users.js';
app.use('/api/admin/users', adminUsersRouter);

// --- RAG API (API key auth, not user auth) ---
import { ragRouter } from './routes/rag.js';
app.use('/api/v1/rag', ragRouter);

// --- Mount route files above this line ---

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

- [ ] **Step 3: Run full API test suite**

```bash
cd apps/api && pnpm test
```

Expected: All tests pass. If any fail due to route path changes, update the test files to use the new `/api/knowledge-bases/:kbId/` prefix.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/versions.ts
git commit -m "feat(api): restructure route mounting under /api/knowledge-bases/:kbId"
```

---

## Phase 4: Frontend

### Task 17: Frontend Types & Helpers

**Files:**
- Modify: `apps/web/lib/article-url.ts`
- Create: `apps/web/lib/hooks/useKb.ts`

- [ ] **Step 1: Update articleUrl to accept kbSlug**

```typescript
// apps/web/lib/article-url.ts
import type { Article } from '@dovetail/types';

export function articleUrl(article: Pick<Article, 'slug' | 'categoryPath' | 'knowledgeBaseSlug'>, kbSlug?: string): string {
  const kb = kbSlug ?? article.knowledgeBaseSlug ?? 'default';
  if (article.categoryPath && article.categoryPath.length > 0) {
    return `/kb/${kb}/articles/${article.categoryPath.join('/')}/${article.slug}`;
  }
  return `/kb/${kb}/articles/${article.slug}`;
}
```

- [ ] **Step 2: Create useKb hook**

```typescript
// apps/web/lib/hooks/useKb.ts
'use client';

import { createContext, useContext } from 'react';
import type { KnowledgeBase } from '@dovetail/types';

export const KbContext = createContext<KnowledgeBase | null>(null);

export function useKb(): KnowledgeBase {
  const kb = useContext(KbContext);
  if (!kb) throw new Error('useKb must be used within a KbProvider');
  return kb;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/article-url.ts apps/web/lib/hooks/useKb.ts
git commit -m "feat(web): update articleUrl for KB routing, add useKb hook"
```

---

### Task 18: KB Layout with Context Provider

**Files:**
- Create: `apps/web/app/(main)/kb/[kbSlug]/layout.tsx`
- Create: `apps/web/components/KbSidebar.tsx`
- Create: `apps/web/components/KbSwitcher.tsx`
- Create: `apps/web/components/KbProvider.tsx`

- [ ] **Step 1: Create KbProvider (client component)**

```typescript
// apps/web/components/KbProvider.tsx
'use client';

import { KbContext } from '../lib/hooks/useKb';
import type { KnowledgeBase } from '@dovetail/types';

export function KbProvider({ kb, children }: { kb: KnowledgeBase; children: React.ReactNode }) {
  return <KbContext.Provider value={kb}>{children}</KbContext.Provider>;
}
```

- [ ] **Step 2: Create KbSwitcher component**

```typescript
// apps/web/components/KbSwitcher.tsx
'use client';

import { useRouter } from 'next/navigation';
import type { KnowledgeBase } from '@dovetail/types';

export function KbSwitcher({ knowledgeBases, currentSlug }: { knowledgeBases: KnowledgeBase[]; currentSlug: string }) {
  const router = useRouter();

  return (
    <select
      value={currentSlug}
      onChange={(e) => router.push(`/kb/${e.target.value}`)}
      className="w-full px-3 py-2 text-sm rounded-md bg-sidebar-hover text-sidebar-text border border-sidebar-hover font-[family-name:var(--font-ui)]"
    >
      {knowledgeBases.map((kb) => (
        <option key={kb.id} value={kb.slug}>{kb.name}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Create KbSidebar (server component)**

```typescript
// apps/web/components/KbSidebar.tsx
import Link from 'next/link';
import Image from 'next/image';
import { apiFetch } from '../lib/api';
import { auth } from '../auth';
import type { Category, KnowledgeBase, Role } from '@dovetail/types';
import { SidebarCategories } from './SidebarCategories';
import { KbSwitcher } from './KbSwitcher';

export async function KbSidebar({ kbId, kbSlug }: { kbId: string; kbSlug: string }) {
  let categories: Category[] = [];
  let knowledgeBases: KnowledgeBase[] = [];

  try {
    [categories, knowledgeBases] = await Promise.all([
      apiFetch<Category[]>(`/api/knowledge-bases/${kbId}/categories`),
      apiFetch<KnowledgeBase[]>('/api/knowledge-bases'),
    ]);
  } catch {
    // API unavailable
  }

  const session = await auth();
  const userRole: Role = (session?.user?.role as Role) ?? 'viewer';

  return (
    <>
      <div className="h-24 flex items-center px-4 border-b border-sidebar-hover shrink-0">
        <Link href="/" className="block">
          <Image
            src="/logos/mla-primary-white.png"
            alt="Maryland Legal Aid"
            width={220}
            height={92}
            className="w-auto"
            priority
          />
        </Link>
      </div>

      <div className="px-3 py-3 border-b border-sidebar-hover">
        <KbSwitcher knowledgeBases={knowledgeBases} currentSlug={kbSlug} />
      </div>

      <nav aria-label="Categories" className="flex-1 overflow-y-auto py-3">
        <SidebarCategories categories={categories} userRole={userRole} kbSlug={kbSlug} />
      </nav>
    </>
  );
}
```

- [ ] **Step 4: Create KB layout**

```typescript
// apps/web/app/(main)/kb/[kbSlug]/layout.tsx
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { KbProvider } from '../../../../components/KbProvider';
import { KbSidebar } from '../../../../components/KbSidebar';
import { SidebarWrapper } from '../../../../components/SidebarWrapper';
import type { KnowledgeBase } from '@dovetail/types';

async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  try {
    const kbs = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
    return kbs.find(kb => kb.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export default async function KbLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kbSlug: string }>;
}) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);

  if (!kb) notFound();

  return (
    <KbProvider kb={kb}>
      <SidebarWrapper>
        <KbSidebar kbId={kb.id} kbSlug={kb.slug} />
      </SidebarWrapper>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </KbProvider>
  );
}
```

- [ ] **Step 5: Update SidebarCategories to accept kbSlug**

In `apps/web/components/SidebarCategories.tsx`, add a `kbSlug` prop and use it to build category links as `/kb/${kbSlug}/categories/...` instead of `/categories/...`.

- [ ] **Step 6: Update main layout to remove sidebar for KB routes**

The `(main)/layout.tsx` currently includes the Sidebar. Since KB routes have their own layout with KbSidebar, update the main layout to only show the sidebar when NOT inside a KB route. The simplest approach: remove the sidebar from `(main)/layout.tsx` entirely, and add it back only for non-KB pages (the dashboard). For KB pages, the `kb/[kbSlug]/layout.tsx` provides the sidebar.

Update `apps/web/app/(main)/layout.tsx`:

```typescript
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      {children}
    </div>
  );
}
```

Move the header into the KB layout and a separate dashboard layout.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/(main)/kb/ apps/web/components/KbProvider.tsx apps/web/components/KbSidebar.tsx apps/web/components/KbSwitcher.tsx apps/web/app/(main)/layout.tsx apps/web/components/SidebarCategories.tsx
git commit -m "feat(web): add KB layout with sidebar, switcher, and context provider"
```

---

### Task 19: Dashboard — KB List

**Files:**
- Modify: `apps/web/app/(main)/page.tsx`

- [ ] **Step 1: Update dashboard to show KB list and recent articles across KBs**

```typescript
// apps/web/app/(main)/page.tsx
import Link from 'next/link';
import { Library, Clock, FilePlus, Search } from 'lucide-react';
import { auth } from '../../auth';
import { apiFetch } from '../../lib/api';
import { hasMinimumRole } from '../../lib/roles';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import type { KnowledgeBase, Role } from '@dovetail/types';

export default async function HomePage() {
  const session = await auth();
  const userRole = (session?.user?.role as Role) ?? 'viewer';
  const isAdmin = hasMinimumRole(userRole, 'admin');

  let knowledgeBases: KnowledgeBase[] = [];
  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {
    // API unavailable
  }

  return (
    <main id="main-content" className="flex-1 p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
          Knowledge Bases
        </h1>
        {session?.user?.name && (
          <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">
            Signed in as {session.user.name}
          </p>
        )}
      </header>

      {isAdmin && (
        <div className="mb-6">
          <Link href="/admin/knowledge-bases">
            <Button variant="secondary" size="sm">Manage Knowledge Bases</Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {knowledgeBases.map((kb) => (
          <Link key={kb.id} href={`/kb/${kb.slug}`}>
            <Card className="hover:border-accent transition-colors cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <Library className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink">
                    {kb.name}
                  </h2>
                  {kb.description && (
                    <p className="text-ink-muted text-sm mt-1 font-[family-name:var(--font-ui)]">
                      {kb.description}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {knowledgeBases.length === 0 && (
        <Card>
          <p className="text-ink-muted text-sm font-[family-name:var(--font-ui)]">
            No knowledge bases yet. {isAdmin ? 'Create one from the admin panel.' : 'Contact an admin to get started.'}
          </p>
        </Card>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(main)/page.tsx
git commit -m "feat(web): update dashboard to show knowledge base list"
```

---

### Task 20: KB Home Page

**Files:**
- Create: `apps/web/app/(main)/kb/[kbSlug]/page.tsx`

- [ ] **Step 1: Create KB home page**

```typescript
// apps/web/app/(main)/kb/[kbSlug]/page.tsx
import Link from 'next/link';
import { FilePlus, Search, Clock, FileEdit } from 'lucide-react';
import { auth } from '../../../../auth';
import { apiFetch } from '../../../../lib/api';
import { hasMinimumRole } from '../../../../lib/roles';
import { articleUrl } from '../../../../lib/article-url';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Badge } from '../../../../components/ui/Badge';
import type { Article, KnowledgeBase, Role } from '@dovetail/types';

interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number; }

async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  try {
    const kbs = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
    return kbs.find(kb => kb.slug === slug) ?? null;
  } catch { return null; }
}

export default async function KbHomePage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) return null; // layout handles notFound

  const session = await auth();
  const userRole = (session?.user?.role as Role) ?? 'viewer';
  const isEditor = hasMinimumRole(userRole, 'editor');

  let recentArticles: Article[] = [];
  let userDrafts: Article[] = [];

  try {
    const recent = await apiFetch<PaginatedResponse<Article>>(
      `/api/knowledge-bases/${kb.id}/articles?limit=10&status=published`,
    );
    recentArticles = recent.data;
  } catch {}

  if (isEditor) {
    try {
      const drafts = await apiFetch<PaginatedResponse<Article>>(
        `/api/knowledge-bases/${kb.id}/articles?limit=5&status=draft`,
      );
      userDrafts = drafts.data;
    } catch {}
  }

  return (
    <main id="main-content" className="flex-1 p-8">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
          {kb.name}
        </h1>
        {kb.description && (
          <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">{kb.description}</p>
        )}
      </header>

      <div className="flex items-center gap-3 mb-10">
        {isEditor && (
          <Link href={`/kb/${kbSlug}/articles/new`}>
            <Button><FilePlus className="w-4 h-4" /> New Article</Button>
          </Link>
        )}
        <Link href={`/kb/${kbSlug}/search`}>
          <Button variant="secondary"><Search className="w-4 h-4" /> Search</Button>
        </Link>
      </div>

      {isEditor && userDrafts.length > 0 && (
        <section className="mb-10">
          <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-4 flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-warning" /> Recent Drafts
          </h2>
          <div className="space-y-1">
            {userDrafts.map((article) => (
              <Link key={article.id} href={articleUrl(article, kbSlug)}
                className="block px-4 py-3 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-[family-name:var(--font-ui)] text-sm font-medium text-ink group-hover:text-accent transition-colors truncate">
                    {article.title}
                  </span>
                  <Badge variant="draft">draft</Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-ink-muted" /> Recently Updated
        </h2>
        {recentArticles.length === 0 ? (
          <Card>
            <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">
              No articles yet. {isEditor ? 'Create the first article to get started.' : 'Check back soon.'}
            </p>
          </Card>
        ) : (
          <ul className="space-y-1">
            {recentArticles.map((article) => (
              <li key={article.id}>
                <Link href={articleUrl(article, kbSlug)}
                  className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors truncate">
                        {article.title}
                      </h3>
                      <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
                        Updated {new Date(article.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <Badge variant={article.status as 'published' | 'draft' | 'archived'}>{article.status}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(main)/kb/[kbSlug]/page.tsx
git commit -m "feat(web): add KB home page with recent articles and drafts"
```

---

### Task 21: KB-Scoped Article Pages

**Files:**
- Create: `apps/web/app/(main)/kb/[kbSlug]/articles/[...slugPath]/page.tsx`
- Create: `apps/web/app/(main)/kb/[kbSlug]/articles/new/page.tsx`

- [ ] **Step 1: Create article view/edit/history page**

Copy the existing `apps/web/app/(main)/articles/[...slugPath]/page.tsx` into the new path. Update:
- All `apiFetch` calls to use `/api/knowledge-bases/${kb.id}/` prefix
- All internal links to use `/kb/${kbSlug}/` prefix
- `articleUrl` calls to pass `kbSlug`
- Add `kbSlug` param extraction from route params
- Fetch KB by slug at the top (same helper as KB home page)

Key changes pattern:
```typescript
// Before:
const article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
// After:
const article = await apiFetch<Article>(`/api/knowledge-bases/${kb.id}/articles/by-path/${slugPath.join('/')}`);

// Before:
href={`/articles/${categoryPath}/${slug}/edit`}
// After:
href={`/kb/${kbSlug}/articles/${categoryPath}/${slug}/edit`}
```

- [ ] **Step 2: Create new article page**

Copy the existing `apps/web/app/(main)/articles/new/page.tsx` into the new path. Update:
- Category fetch to use `/api/knowledge-bases/${kb.id}/categories`
- Article creation to POST to `/api/knowledge-bases/${kb.id}/articles`
- Tag fetch to use `/api/knowledge-bases/${kb.id}/tags`
- Redirect after creation to `/kb/${kbSlug}/articles/...`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(main)/kb/[kbSlug]/articles/
git commit -m "feat(web): add KB-scoped article view, edit, and create pages"
```

---

### Task 22: KB-Scoped Category & Search Pages

**Files:**
- Create: `apps/web/app/(main)/kb/[kbSlug]/categories/[...slugPath]/page.tsx`
- Create: `apps/web/app/(main)/kb/[kbSlug]/search/page.tsx`

- [ ] **Step 1: Create category page**

Copy existing `apps/web/app/(main)/categories/[...slugPath]/page.tsx`. Update:
- Category fetch to use `/api/knowledge-bases/${kb.id}/categories`
- Article links to use `/kb/${kbSlug}/articles/...`
- "New article" link to `/kb/${kbSlug}/articles/new?categoryId=...`

- [ ] **Step 2: Create search page**

Copy existing `apps/web/app/(main)/search/page.tsx`. Update:
- Search API call to `/api/knowledge-bases/${kb.id}/search?...`
- Result links to use `/kb/${kbSlug}/articles/...`
- Category filter dropdown fetched from `/api/knowledge-bases/${kb.id}/categories`
- Tag filter fetched from `/api/knowledge-bases/${kb.id}/tags`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(main)/kb/[kbSlug]/categories/ apps/web/app/(main)/kb/[kbSlug]/search/
git commit -m "feat(web): add KB-scoped category and search pages"
```

---

### Task 23: KB Admin Pages

**Files:**
- Create: `apps/web/app/(main)/kb/[kbSlug]/admin/page.tsx`
- Create: `apps/web/app/(main)/kb/[kbSlug]/admin/users/page.tsx`
- Create: `apps/web/app/(main)/kb/[kbSlug]/admin/tags/page.tsx`
- Create: `apps/web/app/(main)/kb/[kbSlug]/admin/import/page.tsx`

- [ ] **Step 1: Create KB admin dashboard**

```typescript
// apps/web/app/(main)/kb/[kbSlug]/admin/page.tsx
import Link from 'next/link';
import { Users, Tag, Upload } from 'lucide-react';
import { auth } from '../../../../../auth';
import { hasMinimumRole } from '../../../../../lib/roles';
import { Card } from '../../../../../components/ui/Card';
import { RoleGate } from '../../../../../components/RoleGate';
import type { Role } from '@dovetail/types';

export default async function KbAdminPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;

  return (
    <RoleGate minimumRole="admin">
      <main id="main-content" className="flex-1 p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink mb-6">
          KB Administration
        </h1>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href={`/kb/${kbSlug}/admin/users`}>
            <Card className="hover:border-accent transition-colors cursor-pointer">
              <Users className="w-6 h-6 text-accent mb-2" />
              <h2 className="font-semibold text-ink">Users & Roles</h2>
              <p className="text-ink-muted text-sm mt-1">Manage user roles in this KB</p>
            </Card>
          </Link>
          <Link href={`/kb/${kbSlug}/admin/tags`}>
            <Card className="hover:border-accent transition-colors cursor-pointer">
              <Tag className="w-6 h-6 text-accent mb-2" />
              <h2 className="font-semibold text-ink">Tags</h2>
              <p className="text-ink-muted text-sm mt-1">Manage tags for this KB</p>
            </Card>
          </Link>
          <Link href={`/kb/${kbSlug}/admin/import`}>
            <Card className="hover:border-accent transition-colors cursor-pointer">
              <Upload className="w-6 h-6 text-accent mb-2" />
              <h2 className="font-semibold text-ink">Import</h2>
              <p className="text-ink-muted text-sm mt-1">Import content into this KB</p>
            </Card>
          </Link>
        </div>
      </main>
    </RoleGate>
  );
}
```

- [ ] **Step 2: Create KB users/roles page**

Fetch users from `/api/knowledge-bases/${kb.id}/users`. Show a table of users with their KB role. Allow setting/removing KB roles via POST/DELETE to `/api/knowledge-bases/${kb.id}/users/:userId`.

- [ ] **Step 3: Create KB tags page**

Copy existing `apps/web/app/(main)/admin/tags/page.tsx`. Update API calls to use `/api/knowledge-bases/${kb.id}/tags`.

- [ ] **Step 4: Create KB import page**

Copy existing `apps/web/app/(main)/admin/import/page.tsx`. Update API calls to use `/api/knowledge-bases/${kb.id}/admin/import/*`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(main)/kb/[kbSlug]/admin/
git commit -m "feat(web): add KB admin pages for users, tags, and import"
```

---

### Task 24: Global Admin — KB Management Page

**Files:**
- Create: `apps/web/app/(main)/admin/knowledge-bases/page.tsx`

- [ ] **Step 1: Create KB management page**

```typescript
// apps/web/app/(main)/admin/knowledge-bases/page.tsx
import { apiFetch } from '../../../../lib/api';
import { RoleGate } from '../../../../components/RoleGate';
import type { KnowledgeBase } from '@dovetail/types';
import { KbManager } from './KbManager';

export default async function KnowledgeBasesAdminPage() {
  let knowledgeBases: KnowledgeBase[] = [];
  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {}

  return (
    <RoleGate minimumRole="admin">
      <main id="main-content" className="flex-1 p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink mb-6">
          Knowledge Bases
        </h1>
        <KbManager initialKbs={knowledgeBases} />
      </main>
    </RoleGate>
  );
}
```

- [ ] **Step 2: Create KbManager client component**

```typescript
// apps/web/app/(main)/admin/knowledge-bases/KbManager.tsx
'use client';

import { useState } from 'react';
import { apiClientFetch } from '../../../../lib/api-client';
import { useToast } from '../../../../lib/hooks/useToast';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Modal } from '../../../../components/ui/Modal';
import type { KnowledgeBase } from '@dovetail/types';

export function KbManager({ initialKbs }: { initialKbs: KnowledgeBase[] }) {
  const [kbs, setKbs] = useState(initialKbs);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { success, error } = useToast();

  async function handleCreate() {
    setLoading(true);
    try {
      const created = await apiClientFetch<KnowledgeBase>('/api/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({ name, description: description || undefined }),
      });
      setKbs([...kbs, created]);
      setShowCreate(false);
      setName('');
      setDescription('');
      success('Knowledge base created');
    } catch (err: any) {
      error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClientFetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' });
      setKbs(kbs.filter(kb => kb.id !== id));
      success('Knowledge base deleted');
    } catch (err: any) {
      error(err.message);
    }
  }

  return (
    <>
      <Button onClick={() => setShowCreate(true)} className="mb-6">Create Knowledge Base</Button>

      <div className="space-y-3">
        {kbs.map((kb) => (
          <Card key={kb.id}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-ink">{kb.name}</h3>
                <p className="text-ink-muted text-sm">/{kb.slug}</p>
                {kb.description && <p className="text-ink-muted text-sm mt-1">{kb.description}</p>}
              </div>
              <Button variant="danger" size="sm" onClick={() => handleDelete(kb.id)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Knowledge Base">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
              placeholder="e.g., Maryland Housing Law"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Description (optional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
              rows={3}
            />
          </div>
          <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>Create</Button>
        </div>
      </Modal>
    </>
  );
}
```

- [ ] **Step 3: Update global admin dashboard to link to KB management**

In `apps/web/app/(main)/admin/page.tsx`, add a "Knowledge Bases" card linking to `/admin/knowledge-bases`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(main)/admin/knowledge-bases/ apps/web/app/(main)/admin/page.tsx
git commit -m "feat(web): add global admin KB management page"
```

---

### Task 25: Update Global Admin API Keys Page

**Files:**
- Modify: `apps/web/app/(main)/admin/api-keys/page.tsx` (or ApiKeyManager component)

- [ ] **Step 1: Add KB selection to API key creation**

Update the ApiKeyManager component to:
- Fetch available KBs from `/api/knowledge-bases`
- Show a multi-select for KB associations when creating a new key
- Display associated KBs for each existing key
- Include `knowledgeBaseIds` in the create request body

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/(main)/admin/api-keys/ apps/web/components/ApiKeyManager.tsx
git commit -m "feat(web): add KB association to API key management"
```

---

### Task 26: Remove Old Routes & Cleanup

**Files:**
- Remove: `apps/web/app/(main)/articles/`
- Remove: `apps/web/app/(main)/categories/`
- Remove: `apps/web/app/(main)/search/`
- Remove: `apps/web/app/(main)/admin/tags/`
- Remove: `apps/web/app/(main)/admin/import/`
- Modify: `apps/web/app/(main)/layout.tsx` — remove Sidebar import (handled in KB layout)

- [ ] **Step 1: Delete old route directories**

```bash
rm -rf apps/web/app/\(main\)/articles
rm -rf apps/web/app/\(main\)/categories
rm -rf apps/web/app/\(main\)/search
rm -rf apps/web/app/\(main\)/admin/tags
rm -rf apps/web/app/\(main\)/admin/import
```

- [ ] **Step 2: Update any remaining internal links**

Search across the codebase for old link patterns (`/articles/`, `/categories/`, `/search`) and update to KB-prefixed paths. Components like SearchBar, HeaderUserArea, and ArticleActions need updating:

- `SearchBar.tsx`: form action changes from `/search` to use current KB context
- `HeaderUserArea.tsx`: admin link stays at `/admin`
- `ArticleActions.tsx`: edit/move links use KB prefix

- [ ] **Step 3: Run full build to verify no broken imports**

```bash
pnpm build
```

Expected: Clean build with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web): remove old routes, update all internal links to KB-prefixed paths"
```

---

### Task 27: End-to-End Verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 2: Start dev and manually verify**

```bash
pnpm dev
```

Verify:
1. Dashboard shows KB list
2. Clicking a KB enters the KB view with sidebar
3. Categories, articles, search all work within KB context
4. KB admin pages work (users, tags, import)
5. Global admin can create/delete KBs
6. API key creation requires KB selection

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```
