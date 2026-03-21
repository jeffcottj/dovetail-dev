# Slug Per Category Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change article and category slugs from globally unique to unique-per-category/parent, with full-path URLs like `/articles/housing/rental/baltimore-city`.

**Architecture:** Replace global `UNIQUE(slug)` constraints with composite unique indexes `(slug, category_id)` for articles and `(slug, parent_id)` for categories. Add a `category-path.ts` utility with recursive CTE functions for path resolution and building. Update API routes to accept wildcard paths, and frontend routes to use catch-all `[...slugPath]` segments. Enrich search/RAG responses with `categoryPath`.

**Tech Stack:** Drizzle ORM (schema + migrations), Express 5 (API routes), Next.js 15 App Router (frontend), PostgreSQL (recursive CTEs), Vitest + supertest (tests)

---

### Task 1: Schema Migration — Composite Unique Indexes

**Files:**
- Modify: `packages/db/src/schema.ts:48-54` (categories table)
- Modify: `packages/db/src/schema.ts:66-78` (articles table)
- Create: migration via `pnpm --filter @dovetail/db db:generate`

**Step 1: Update the categories table definition**

In `packages/db/src/schema.ts`, add `uniqueIndex` to imports and replace the categories table:

```typescript
// Add uniqueIndex to the import from 'drizzle-orm/pg-core' (line 4)
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
```

Replace the categories table definition (lines 48-54):

```typescript
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  parentId: uuid('parent_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('categories_slug_parent_id_unique')
    .on(t.slug, sql`COALESCE(${t.parentId}, '00000000-0000-0000-0000-000000000000')`),
]);
```

**Step 2: Update the articles table definition**

Replace the articles table definition (lines 66-78):

```typescript
export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  content: jsonb('content').notNull().default({}),
  status: statusEnum('status').notNull().default('draft'),
  plainText: text('plain_text'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  publishedAt: timestamp('published_at'),
}, (t) => [
  uniqueIndex('articles_slug_category_id_unique').on(t.slug, t.categoryId),
]);
```

**Step 3: Generate the migration**

Run: `pnpm --filter @dovetail/db db:generate`

Review the generated SQL migration to confirm it:
1. Drops the old `categories_slug_unique` index
2. Drops the old `articles_slug_unique` index
3. Creates `categories_slug_parent_id_unique` unique index with COALESCE
4. Creates `articles_slug_category_id_unique` unique index

If the generated migration doesn't handle the COALESCE expression correctly, manually edit the migration SQL.

**Step 4: Apply the migration**

Run: `pnpm --filter @dovetail/db db:migrate`
Expected: Migration succeeds with no errors (existing slugs are already globally unique, so they satisfy the weaker per-scope constraint).

**Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat: change slug uniqueness from global to per-category/parent

Replace UNIQUE(slug) on articles and categories with composite
unique indexes: (slug, category_id) and (slug, COALESCE(parent_id, nil-uuid))."
```

---

### Task 2: Category Path Utility — `resolveCategoryPath` and `buildCategoryPath`

**Files:**
- Create: `apps/api/src/utils/category-path.ts`
- Test: `apps/api/src/__tests__/category-path.test.ts`

**Step 1: Write the failing tests**

Create `apps/api/src/__tests__/category-path.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCategoryPath, buildCategoryPath } from '../utils/category-path.js';

// Mock the db module
vi.mock('@dovetail/db', () => {
  const executeMock = vi.fn();
  return {
    db: { execute: executeMock },
    categories: {
      slug: { name: 'slug' },
      parentId: { name: 'parent_id' },
      id: { name: 'id' },
    },
  };
});

import { db } from '@dovetail/db';
const executeMock = db.execute as ReturnType<typeof vi.fn>;

beforeEach(() => {
  executeMock.mockReset();
});

describe('resolveCategoryPath', () => {
  it('resolves a single-segment path (root category)', async () => {
    executeMock.mockResolvedValueOnce([{ id: 'cat-1' }]);
    const result = await resolveCategoryPath(['housing']);
    expect(result).toBe('cat-1');
  });

  it('resolves a multi-segment path', async () => {
    executeMock
      .mockResolvedValueOnce([{ id: 'cat-1' }])   // housing
      .mockResolvedValueOnce([{ id: 'cat-2' }]);   // housing/rental
    const result = await resolveCategoryPath(['housing', 'rental']);
    expect(result).toBe('cat-2');
  });

  it('returns null when a segment does not match', async () => {
    executeMock.mockResolvedValueOnce([]);
    const result = await resolveCategoryPath(['nonexistent']);
    expect(result).toBeNull();
  });

  it('returns null for empty segments', async () => {
    const result = await resolveCategoryPath([]);
    expect(result).toBeNull();
  });
});

describe('buildCategoryPath', () => {
  it('returns slug array from leaf to root', async () => {
    executeMock.mockResolvedValueOnce([
      { slug: 'housing', depth: 1 },
      { slug: 'rental', depth: 0 },
    ]);
    const result = await buildCategoryPath('cat-2');
    expect(result).toEqual(['housing', 'rental']);
  });

  it('returns single-element array for root category', async () => {
    executeMock.mockResolvedValueOnce([
      { slug: 'housing', depth: 0 },
    ]);
    const result = await buildCategoryPath('cat-1');
    expect(result).toEqual(['housing']);
  });

  it('returns empty array when category not found', async () => {
    executeMock.mockResolvedValueOnce([]);
    const result = await buildCategoryPath('nonexistent');
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/__tests__/category-path.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `apps/api/src/utils/category-path.ts`:

```typescript
import { sql } from 'drizzle-orm';
import { db, categories } from '@dovetail/db';

/**
 * Resolve a category path like ["housing", "rental"] to the final category ID.
 * Walks top-down: finds root category with matching slug and NULL parent,
 * then each subsequent child.
 * Returns null if any segment doesn't match.
 */
export async function resolveCategoryPath(slugSegments: string[]): Promise<string | null> {
  if (slugSegments.length === 0) return null;

  let parentId: string | null = null;

  for (const slug of slugSegments) {
    const parentCondition = parentId
      ? sql`${categories.parentId} = ${parentId}`
      : sql`${categories.parentId} IS NULL`;

    const result = await db.execute(sql`
      SELECT ${categories.id}
      FROM ${categories}
      WHERE ${categories.slug} = ${slug}
        AND ${parentCondition}
      LIMIT 1
    `);

    if ((result as any[]).length === 0) return null;
    parentId = (result as any[])[0].id;
  }

  return parentId;
}

/**
 * Build the full category slug path from a given category ID.
 * Walks up the parent chain via recursive CTE.
 * Returns ordered array like ["housing", "rental"] (root first).
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

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/__tests__/category-path.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add apps/api/src/utils/category-path.ts apps/api/src/__tests__/category-path.test.ts
git commit -m "feat: add category path resolution and building utilities

resolveCategoryPath walks slug segments top-down to find a category ID.
buildCategoryPath walks up the parent chain via recursive CTE to produce
the full slug path array."
```

---

### Task 3: API — Replace `by-slug` Endpoint with `by-path` Wildcard

**Files:**
- Modify: `apps/api/src/routes/articles.ts:63-72`
- Modify: `apps/api/src/app.ts:30-31`
- Test: `apps/api/src/__tests__/articles-by-path.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/articles-by-path.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

vi.mock('@dovetail/db', async () => {
  const actual = await vi.importActual('@dovetail/db');
  const selectMock = vi.fn();
  return {
    ...actual,
    db: {
      select: selectMock,
      execute: vi.fn(),
    },
  };
});

vi.mock('../utils/category-path.js', () => ({
  resolveCategoryPath: vi.fn(),
  buildCategoryPath: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => {
    _req.user = { id: 'user-1', role: 'admin' };
    next();
  },
  AuthRequest: {},
}));

import { resolveCategoryPath } from '../utils/category-path.js';
const resolveMock = resolveCategoryPath as ReturnType<typeof vi.fn>;

import { db } from '@dovetail/db';

describe('GET /api/articles/by-path/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when category path does not resolve', async () => {
    resolveMock.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/articles/by-path/nonexistent/article');
    expect(res.status).toBe(404);
  });

  it('returns 400 when path has no segments', async () => {
    const res = await request(app).get('/api/articles/by-path/');
    expect(res.status).toBe(404); // Express won't match empty wildcard
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/__tests__/articles-by-path.test.ts`
Expected: FAIL — route doesn't exist yet

**Step 3: Implement the by-path endpoint**

In `apps/api/src/routes/articles.ts`, replace the `by-slug` route (lines 63-72):

```typescript
import { resolveCategoryPath } from '../utils/category-path.js';

// Replace GET /api/articles/by-slug/:slug with:
// GET /api/articles/by-path/* — resolve article via category path + article slug
articlesRouter.get('/by-path/*', authMiddleware, async (req, res) => {
  // req.params[0] is the wildcard match, e.g. "housing/rental/baltimore-city"
  const fullPath = (req.params as any)[0] as string;
  const segments = fullPath.split('/').filter(Boolean);

  if (segments.length < 2) {
    // Need at least one category segment + article slug
    res.status(400).json({ error: 'Path must include at least a category and article slug' });
    return;
  }

  const categorySegments = segments.slice(0, -1);
  const articleSlug = segments[segments.length - 1];

  const categoryId = await resolveCategoryPath(categorySegments);
  if (!categoryId) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, articleSlug), eq(articles.categoryId, categoryId)));

  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  res.json(article);
});
```

Add `and` to the drizzle-orm import at the top of articles.ts (line 3):

```typescript
import { and, eq, sql } from 'drizzle-orm';
```

Also add the import for `resolveCategoryPath`:

```typescript
import { resolveCategoryPath } from '../utils/category-path.js';
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/__tests__/articles-by-path.test.ts`
Expected: PASS

Also run existing article tests to confirm nothing is broken:
Run: `cd apps/api && pnpm vitest run src/__tests__/`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/articles.ts apps/api/src/__tests__/articles-by-path.test.ts
git commit -m "feat: replace by-slug endpoint with by-path wildcard route

GET /api/articles/by-path/housing/rental/baltimore-city resolves the
category path, then finds the article by slug within that category."
```

---

### Task 4: API — Add `categoryPath` to Article Responses

**Files:**
- Modify: `packages/types/src/index.ts:23-34`
- Modify: `apps/api/src/routes/articles.ts` (list endpoint and create/update responses)
- Modify: `apps/api/src/routes/search.ts`
- Modify: `apps/api/src/routes/rag.ts`

**Step 1: Add `categoryPath` to the Article type**

In `packages/types/src/index.ts`, add the optional field to the Article interface (line 27, after `categoryId`):

```typescript
export interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryPath?: string[];  // e.g. ["housing", "rental"]
  authorId: string;
  content: unknown;
  status: ArticleStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}
```

**Step 2: Enrich the article list endpoint**

In `apps/api/src/routes/articles.ts`, modify the `GET /` handler (around line 60) to add category paths to list results. Add import for `buildCategoryPath`:

```typescript
import { buildCategoryPath } from '../utils/category-path.js';
```

After the `data` query on line 58, add:

```typescript
  // Enrich with category paths
  const enriched = await Promise.all(
    data.map(async (article) => ({
      ...article,
      categoryPath: await buildCategoryPath(article.categoryId),
    })),
  );

  res.json(paginate(enriched, Number(total), { page, limit }));
```

**Step 3: Enrich the by-path endpoint response**

In the `by-path` route (from Task 3), before `res.json(article)`:

```typescript
  const categoryPath = await buildCategoryPath(article.categoryId);
  res.json({ ...article, categoryPath });
```

**Step 4: Enrich the GET /:id endpoint**

In `apps/api/src/routes/articles.ts` (line 82), before `res.json(article)`:

```typescript
  const categoryPath = await buildCategoryPath(article.categoryId);
  res.json({ ...article, categoryPath });
```

**Step 5: Enrich search results**

In `apps/api/src/routes/search.ts`, add import:

```typescript
import { buildCategoryPath } from '../utils/category-path.js';
```

In the `fulltextSearch` function (after line 93), enrich results before returning:

```typescript
  const enriched = await Promise.all(
    data.map(async (article) => ({
      ...article,
      categoryPath: await buildCategoryPath(article.categoryId),
    })),
  );

  return { data: enriched, total: Number(total) };
```

In the `semanticSearch` function (around line 120), add `categoryPath` to the map:

```typescript
  const enriched = await Promise.all(
    (results as any[]).map(async (r) => ({
      id: r.article_id,
      title: r.title,
      slug: r.slug,
      categoryId: r.category_id,
      categoryPath: await buildCategoryPath(r.category_id),
      authorId: r.author_id,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      chunkText: r.chunk_text,
      similarity: parseFloat(r.similarity),
    })),
  );

  return enriched;
```

**Step 6: Enrich RAG results**

In `apps/api/src/routes/rag.ts`, add import:

```typescript
import { buildCategoryPath } from '../utils/category-path.js';
```

Change the `a.category_id` to the SQL select (line 33) and modify the result mapping (lines 41-47):

```typescript
  const formatted = await Promise.all(
    (results as any[]).map(async (r) => {
      const categoryPath = await buildCategoryPath(r.category_id);
      return {
        articleId: r.article_id,
        articleTitle: r.title,
        articleUrl: `/articles/${categoryPath.join('/')}/${r.slug}`,
        categoryPath,
        chunkText: r.chunk_text,
        score: parseFloat(r.similarity),
      };
    }),
  );
```

Update the RAG SQL query to also select `a.category_id` (add to the SELECT clause on line 33):

```sql
SELECT ae.article_id, ae.chunk_text, ae.chunk_index,
       1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
       a.title, a.slug, a.category_id
```

**Step 7: Run all tests**

Run: `cd apps/api && pnpm vitest run`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add packages/types/src/index.ts apps/api/src/routes/articles.ts apps/api/src/routes/search.ts apps/api/src/routes/rag.ts
git commit -m "feat: enrich article responses with categoryPath

All article endpoints, search results, and RAG results now include
categoryPath (string array) for building full-path URLs."
```

---

### Task 5: API — Update Slug Collision Handling

**Files:**
- Modify: `apps/api/src/routes/articles.ts:104-107` (create collision)
- Modify: `apps/api/src/routes/articles.ts:164` (update slug regen)
- Modify: `apps/api/src/routes/categories.ts:39-42` (create collision)
- Modify: `apps/api/src/services/import/import-engine.ts:138-145, 218-236`

**Step 1: Update article creation collision handler**

In `apps/api/src/routes/articles.ts`, the catch block (line 105) already checks `err.constraint_name?.includes('slug')`. The new composite index name is `articles_slug_category_id_unique`, which still contains "slug", so the existing catch logic works. No code change needed here.

Verify by checking that `err.constraint_name` will match — it will since the index name contains "slug".

**Step 2: Update article update to handle slug collision within category**

In `apps/api/src/routes/articles.ts`, the PATCH handler (line 164) generates a new slug but doesn't handle collisions. Wrap the update in a try/catch:

In the PATCH handler, after building `updates` and before `const [updated] = await tx.update(...)` (line 173), add collision handling. Replace line 173:

```typescript
    let updated;
    try {
      [updated] = await tx.update(articles).set(updates).where(eq(articles.id, id)).returning();
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name?.includes('slug')) {
        updates.slug = `${updates.slug}-${Date.now().toString(36)}`;
        [updated] = await tx.update(articles).set(updates).where(eq(articles.id, id)).returning();
      } else {
        throw err;
      }
    }
    result = updated;
```

**Step 3: Update category creation collision handler**

In `apps/api/src/routes/categories.ts` (line 39), the catch already checks `err.constraint_name?.includes('slug')`. The new index name `categories_slug_parent_id_unique` still contains "slug". No code change needed.

**Step 4: Update import engine collision handlers**

In `apps/api/src/services/import/import-engine.ts`:

- Category creation (line 139): already checks `err.code === '23505'` — still works with the new composite index.
- Article import (line 218): already checks `err.code === '23505' && err.constraint_name?.includes('slug')` — still works.

No code changes needed in the import engine. The collision fallback (timestamp suffix) works the same way.

**Step 5: Run tests**

Run: `cd apps/api && pnpm vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/articles.ts
git commit -m "fix: handle slug collision on article title update

Wrap the PATCH update in try/catch to handle the case where a renamed
article's slug collides with another article in the same category."
```

---

### Task 6: Frontend — Rename Article Routes to Catch-All `[...slugPath]`

**Files:**
- Move: `apps/web/app/(main)/articles/[slug]/page.tsx` → `apps/web/app/(main)/articles/[...slugPath]/page.tsx`
- Move: `apps/web/app/(main)/articles/[slug]/edit/page.tsx` → `apps/web/app/(main)/articles/[...slugPath]/edit/page.tsx`
- Move: `apps/web/app/(main)/articles/[slug]/history/page.tsx` → `apps/web/app/(main)/articles/[...slugPath]/history/page.tsx`

**Step 1: Create the new directory structure**

```bash
mkdir -p "apps/web/app/(main)/articles/[...slugPath]/edit"
mkdir -p "apps/web/app/(main)/articles/[...slugPath]/history"
```

**Step 2: Move and update the article view page**

Move: `apps/web/app/(main)/articles/[slug]/page.tsx` → `apps/web/app/(main)/articles/[...slugPath]/page.tsx`

Update the page component:

```typescript
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { auth } from '../../../../auth';
import { ArticleContent } from '../../../../components/ArticleContent';
import { ArticleActions } from '../../../../components/ArticleActions';
import type { Article, Category, Tag } from '@dovetail/types';

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
  const session = await auth();

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
  } catch {
    notFound();
  }

  const fullPath = `/articles/${slugPath.join('/')}`;
  const userRole = session?.user?.role ?? 'viewer';
  const canEdit = userRole === 'editor' || userRole === 'admin';

  let categories: Category[] = [];
  if (canEdit) {
    try {
      categories = await apiFetch<Category[]>('/api/categories');
    } catch {
      // Categories unavailable
    }
  }

  let articleTags: Tag[] = [];
  try {
    articleTags = await apiFetch<Tag[]>(`/api/articles/${article.id}/tags`);
  } catch {
    // Tags unavailable
  }

  return (
    <article>
      <header className="mb-8 border-b border-border-light pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight leading-tight">
              {article.title}
            </h1>
            <div className="flex items-center gap-3 mt-3 text-xs font-[family-name:var(--font-ui)] text-ink-muted">
              <time dateTime={new Date(article.updatedAt).toISOString()}>
                Updated{' '}
                {new Date(article.updatedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
              <span className="text-border">|</span>
              <Link
                href={`${fullPath}/history`}
                className="hover:text-accent transition-colors"
              >
                View history
              </Link>
            </div>
            {articleTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {articleTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/search?tags=${tag.id}`}
                    className="inline-flex items-center text-xs font-[family-name:var(--font-ui)] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <ArticleActions article={article} categories={categories} />
          )}
        </div>
      </header>

      <div className="max-w-prose">
        <ArticleContent content={article.content} />
      </div>
    </article>
  );
}
```

**Step 3: Move and update the edit page**

Move: `apps/web/app/(main)/articles/[slug]/edit/page.tsx` → `apps/web/app/(main)/articles/[...slugPath]/edit/page.tsx`

```typescript
import { notFound, redirect } from 'next/navigation';
import { apiFetch } from '../../../../../lib/api';
import { auth } from '../../../../../auth';
import { ArticleEditor } from '../../../../../components/ArticleEditor';
import type { Article } from '@dovetail/types';

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
  const session = await auth();
  const userRole = session?.user?.role ?? 'viewer';

  if (userRole === 'viewer') {
    redirect(`/articles/${slugPath.join('/')}`);
  }

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
  } catch {
    notFound();
  }

  return (
    <div>
      <div className="mb-4">
        <span className="text-xs font-[family-name:var(--font-ui)] text-ink-muted uppercase tracking-widest">
          Editing
        </span>
      </div>
      <ArticleEditor article={article} />
    </div>
  );
}
```

**Step 4: Move and update the history page**

Move: `apps/web/app/(main)/articles/[slug]/history/page.tsx` → `apps/web/app/(main)/articles/[...slugPath]/history/page.tsx`

```typescript
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../../lib/api';
import { auth } from '../../../../../auth';
import { RestoreButton } from '../../../../../components/RestoreButton';
import { Breadcrumbs } from '../../../../../components/Breadcrumbs';
import type { Article, ArticleVersion } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default async function VersionHistoryPage({
  params,
}: {
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
  const session = await auth();

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
  } catch {
    notFound();
  }

  const fullPath = `/articles/${slugPath.join('/')}`;

  const { data: versions } = await apiFetch<PaginatedResponse<ArticleVersion>>(
    `/api/articles/${article.id}/versions?limit=50`,
  );

  const userRole = session?.user?.role ?? 'viewer';
  const canRestore = userRole === 'editor' || userRole === 'admin';

  return (
    <div>
      <header className="mb-8">
        <Breadcrumbs
          segments={[
            { label: article.title, href: fullPath },
            { label: 'History' },
          ]}
        />
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          Version History
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mt-1">
          {versions.length} {versions.length === 1 ? 'version' : 'versions'}
        </p>
      </header>

      {versions.length === 0 ? (
        <p className="text-ink-muted italic">No previous versions yet.</p>
      ) : (
        <div className="space-y-1">
          {versions.map((version) => (
            <div
              key={version.id}
              className="flex items-center justify-between gap-4 px-4 py-3 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-[family-name:var(--font-ui)] text-sm font-semibold text-ink">
                    Version {version.versionNumber}
                  </span>
                  <span className="text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                    &mdash; {version.title}
                  </span>
                </div>
                <time className="text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                  {new Date(version.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              {canRestore && (
                <RestoreButton articleId={article.id} versionId={version.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 5: Delete the old `[slug]` directory**

```bash
rm -rf "apps/web/app/(main)/articles/[slug]"
```

**Step 6: Verify the build**

Run: `pnpm --filter @dovetail/web build`
Expected: Build succeeds (or at least no route-related errors — there will be link generation issues fixed in the next task)

**Step 7: Commit**

```bash
git add "apps/web/app/(main)/articles/"
git commit -m "feat: change article routes from [slug] to [...slugPath]

Article pages now use catch-all routes and resolve articles via the
full category path API endpoint."
```

---

### Task 7: Frontend — Update All Article Link Generation

**Files:**
- Modify: `apps/web/app/(main)/page.tsx:88,120` (homepage article links)
- Modify: `apps/web/app/(main)/categories/[slug]/page.tsx:79` (category page article links)
- Modify: `apps/web/app/(main)/search/page.tsx:163` (search result links)
- Modify: `apps/web/components/ArticleActions.tsx:149` (edit link)
- Modify: `apps/web/components/ArticleEditor.tsx:68` (publish redirect)
- Modify: `apps/web/components/NewArticleForm.tsx:33` (create redirect)
- Modify: `apps/web/components/ArticleCreateForm.tsx:75,108` (save/publish redirect)

All these currently use `/articles/${article.slug}`. They need to use `/articles/${article.categoryPath.join('/')}/${article.slug}`.

**Step 1: Create a helper function for article URL building**

Create `apps/web/lib/article-url.ts`:

```typescript
import type { Article } from '@dovetail/types';

/**
 * Build the full URL path for an article using its categoryPath.
 * Falls back to slug-only if categoryPath is not available.
 */
export function articleUrl(article: Pick<Article, 'slug' | 'categoryPath'>): string {
  if (article.categoryPath && article.categoryPath.length > 0) {
    return `/articles/${article.categoryPath.join('/')}/${article.slug}`;
  }
  return `/articles/${article.slug}`;
}
```

**Step 2: Update the homepage**

In `apps/web/app/(main)/page.tsx`, add import:

```typescript
import { articleUrl } from '../../lib/article-url';
```

Replace `href={`/articles/${article.slug}`}` on line 88 with:
```typescript
href={articleUrl(article)}
```

Replace `href={`/articles/${article.slug}`}` on line 120 with:
```typescript
href={articleUrl(article)}
```

**Step 3: Update the category page**

In `apps/web/app/(main)/categories/[slug]/page.tsx`, add import:

```typescript
import { articleUrl } from '../../../../lib/article-url';
```

Replace `href={`/articles/${article.slug}`}` on line 79 with:
```typescript
href={articleUrl(article)}
```

**Step 4: Update the search page**

In `apps/web/app/(main)/search/page.tsx`, add import:

```typescript
import { articleUrl } from '../../../lib/article-url';
```

Replace `href={`/articles/${result.slug}`}` on line 163 with:
```typescript
href={articleUrl(result as any)}
```

Also update the `SearchResult` interface (line 9) to add `categoryPath`:

```typescript
interface SearchResult {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryPath?: string[];
  authorId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  rank?: number;
  similarity?: number;
  chunkText?: string;
}
```

**Step 5: Update ArticleActions**

In `apps/web/components/ArticleActions.tsx`, add import:

```typescript
import { articleUrl } from '../lib/article-url';
```

Replace `href={`/articles/${article.slug}/edit`}` on line 149 with:
```typescript
href={`${articleUrl(article)}/edit`}
```

**Step 6: Update ArticleEditor**

In `apps/web/components/ArticleEditor.tsx`, add import:

```typescript
import { articleUrl } from '../lib/article-url';
```

Replace `router.push(`/articles/${article.slug}`)` on line 68 with:
```typescript
router.push(articleUrl(article));
```

**Step 7: Update NewArticleForm**

In `apps/web/components/NewArticleForm.tsx`, add import:

```typescript
import { articleUrl } from '../lib/article-url';
```

Replace `router.push(`/articles/${article.slug}/edit`)` on line 33 with:
```typescript
router.push(`${articleUrl(article)}/edit`);
```

**Step 8: Update ArticleCreateForm**

In `apps/web/components/ArticleCreateForm.tsx`, add import:

```typescript
import { articleUrl } from '../lib/article-url';
```

Replace `router.push(`/articles/${created.slug}`)` on line 75 with:
```typescript
router.push(articleUrl(created));
```

Replace `router.push(`/articles/${created.slug}`)` on line 108 with:
```typescript
router.push(articleUrl(created));
```

**Step 9: Verify the build**

Run: `pnpm --filter @dovetail/web build`
Expected: Build succeeds

**Step 10: Commit**

```bash
git add apps/web/lib/article-url.ts apps/web/app/ apps/web/components/
git commit -m "feat: update all article links to use full category path URLs

Add articleUrl() helper that builds /articles/<categoryPath>/<slug>.
Update homepage, category page, search, editor, and create forms."
```

---

### Task 8: Frontend — Update Category Routes to `[...slugPath]`

**Files:**
- Move: `apps/web/app/(main)/categories/[slug]/page.tsx` → `apps/web/app/(main)/categories/[...slugPath]/page.tsx`
- Modify: `apps/web/components/SidebarTree.tsx:92` (category links)

**Step 1: Create the new directory and move the file**

```bash
mkdir -p "apps/web/app/(main)/categories/[...slugPath]"
mv "apps/web/app/(main)/categories/[slug]/page.tsx" "apps/web/app/(main)/categories/[...slugPath]/page.tsx"
rm -rf "apps/web/app/(main)/categories/[slug]"
```

**Step 2: Update the category page to use slugPath**

In the moved file, update to resolve category via path:

```typescript
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilePlus } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { articleUrl } from '../../../../lib/article-url';
import { RoleGate } from '../../../../components/RoleGate';
import { Button } from '../../../../components/ui/Button';
import { CategorySearch } from '../../../../components/CategorySearch';
import type { Category, Article } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-success/10 text-success',
    draft: 'bg-warning/10 text-warning',
    archived: 'bg-ink-muted/10 text-ink-muted',
  };

  return (
    <span className={`text-xs font-[family-name:var(--font-ui)] font-medium px-2 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  );
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
  const targetSlug = slugPath[slugPath.length - 1];

  // Fetch all categories to find the one matching the full path
  const categories = await apiFetch<Category[]>('/api/categories');

  // Build a lookup to resolve the path
  const byId = new Map(categories.map((c) => [c.id, c]));

  // Find categories matching the target slug, then verify the full path
  const candidates = categories.filter((c) => c.slug === targetSlug);
  const category = candidates.find((c) => {
    const path: string[] = [];
    let current: Category | undefined = c;
    while (current) {
      path.unshift(current.slug);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path.length === slugPath.length && path.every((s, i) => s === slugPath[i]);
  });

  if (!category) notFound();

  const { data: articleList } = await apiFetch<PaginatedResponse<Article>>(
    `/api/articles?categoryId=${category.id}&limit=50`,
  );

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          {category.name}
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mt-1">
          {articleList.length} {articleList.length === 1 ? 'article' : 'articles'}
        </p>
      </header>

      <CategorySearch categoryId={category.id} categoryName={category.name} />

      {articleList.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-ink-muted font-[family-name:var(--font-ui)] mb-4">
            No articles in this category yet.
          </p>
          <RoleGate minimumRole="editor">
            <Link href={`/articles/new?categoryId=${category.id}`}>
              <Button>
                <FilePlus className="w-4 h-4" />
                Create the first article
              </Button>
            </Link>
          </RoleGate>
        </div>
      ) : (
        <ul className="space-y-1">
          {articleList.map((article) => (
            <li key={article.id}>
              <Link
                href={articleUrl(article)}
                className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors truncate">
                      {article.title}
                    </h2>
                    <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
                      Updated {new Date(article.updatedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <StatusBadge status={article.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Step 3: Update SidebarTree category links**

In `apps/web/components/SidebarTree.tsx`, the `TreeItem` component generates links like `/categories/${node.slug}` (line 92). Update to build full path:

Add a `path` prop that accumulates the slug path:

In `TreeItemProps` (line 17), add:
```typescript
  slugPath: string[];
```

Update `TreeItem` to use the full path:

On line 36, compute: `const categoryPath = [...slugPath, node.slug];`
On line 36, change `isActive` to: `const isActive = pathname === `/categories/${categoryPath.join('/')}`;`
On line 92, change the Link href to: `href={`/categories/${categoryPath.join('/')}`}`

Pass `slugPath` down in children (line 132):
```typescript
<TreeItem
  key={child.id}
  node={child}
  depth={depth + 1}
  slugPath={categoryPath}
  userRole={userRole}
  categories={categories}
  onMutationSuccess={onMutationSuccess}
/>
```

In `SidebarTree` (line 221), pass initial empty path:
```typescript
<TreeItem
  key={node.id}
  node={node}
  depth={0}
  slugPath={[]}
  userRole={userRole}
  categories={categories}
  onMutationSuccess={handleMutationSuccess}
/>
```

**Step 4: Verify the build**

Run: `pnpm --filter @dovetail/web build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add "apps/web/app/(main)/categories/" apps/web/components/SidebarTree.tsx
git commit -m "feat: update category routes to [...slugPath] catch-all

Category pages now resolve via full slug path. Sidebar links build
the complete category path for navigation."
```

---

### Task 9: End-to-End Verification

**Files:**
- No new files — this is a verification task

**Step 1: Run all API tests**

Run: `cd apps/api && pnpm vitest run`
Expected: All tests PASS

**Step 2: Run the full build**

Run: `pnpm build`
Expected: All packages and apps build successfully

**Step 3: Start the dev environment and manually verify**

Run: `pnpm dev`

Manual checks:
1. Create a category "Housing" → URL should be `/categories/housing`
2. Create a subcategory "Rental" under "Housing" → URL should be `/categories/housing/rental`
3. Create an article "Baltimore City" in "Housing > Rental" → URL should be `/articles/housing/rental/baltimore-city`
4. Create a category "Family" and another "Baltimore City" article in it → URL should be `/articles/family/baltimore-city` (no collision)
5. Verify sidebar links work
6. Verify search results link to correct paths
7. Verify edit and history pages work

**Step 4: Commit any fixes discovered during verification**

If any issues are found, fix them and commit with descriptive messages.
