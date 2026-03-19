# Slug Per Category Design

**Date:** 2026-03-18
**Status:** Approved

## Problem

Article and category slugs are globally unique. This means two articles with the same title (e.g., "Baltimore City") cannot exist in different categories (e.g., Housing vs. Family). This is a poor fit for a hierarchical knowledge base where the same topic may appear in multiple contexts.

## Decisions

- Article URLs become `/articles/<category-path>/<article-slug>` (e.g., `/articles/housing/baltimore-city`)
- Category slugs become unique per parent (not globally unique)
- No backward compatibility for old flat URLs — clean break
- Slugs continue to track title changes (current behavior preserved)
- RAG API includes category path in results

## Approach: Composite Unique Constraints + Recursive CTE Path Resolution

Replace global `UNIQUE(slug)` constraints with scoped composite constraints. Resolve URL paths using recursive CTEs, a pattern already used in the codebase for permission resolution.

## Schema Changes

### Articles table

- Remove `.unique()` from `slug` column
- Add composite unique constraint: `UNIQUE(slug, category_id)`

### Categories table

- Remove `.unique()` from `slug` column
- Add composite unique index using `COALESCE(parent_id, '00000000-0000-0000-0000-000000000000')` to handle nullable `parent_id` (Postgres treats `NULL != NULL` in unique constraints)

### Migration

- Drop old unique indexes on `articles.slug` and `categories.slug`
- Create new composite unique indexes
- No data migration needed — existing globally-unique slugs trivially satisfy the weaker per-category constraint

## Category Path Resolution

New utility: `apps/api/src/utils/category-path.ts`

### `resolveCategoryPath(slugSegments: string[]): Promise<string | null>`

Given `["housing", "rental"]`, walks top-down: finds root category with `slug = 'housing'` and `parent_id IS NULL`, then child with `slug = 'rental'` and matching `parent_id`. Returns the final category ID or null if any segment doesn't match.

### `buildCategoryPath(categoryId: string): Promise<string[]>`

Given a category ID, walks up the parent chain via recursive CTE to produce the ordered slug array `["housing", "rental"]`. Used when constructing URLs for articles in search results, RAG responses, and frontend link generation.

Both functions use a single recursive CTE query each. Category trees are typically 1-3 levels deep.

## API Route Changes

### Article lookup

Replace `GET /api/articles/by-slug/:slug` with `GET /api/articles/by-path/*` (wildcard route). Path segments are split — all except the last are the category path, the last is the article slug. Example: `/api/articles/by-path/housing/rental/baltimore-city` resolves category `housing/rental`, then finds the article with `slug = 'baltimore-city'` in that category.

### Article creation (`POST /api/articles`)

Slug collision handling catches duplicate key on the composite `(slug, category_id)` index. Timestamp-suffix fallback still applies.

### Article update (`PATCH /api/articles/:id`)

When title changes, slug is regenerated and checked for uniqueness within the article's `category_id`. Same collision fallback.

### Category routes

Collision handling checks the composite `(slug, parent_id)` constraint instead of global uniqueness.

### Import engine

Already checks `(slug, parentId)` for categories — aligns naturally. Article import adjusted to check slug uniqueness within the target category.

## Frontend Route Changes

### Article routes

Replace `[slug]` dynamic segment with `[...slugPath]` catch-all:

- `articles/[...slugPath]/page.tsx` — view
- `articles/[...slugPath]/edit/page.tsx` — edit
- `articles/[...slugPath]/history/page.tsx` — history

Pages split the `slugPath` array: everything except the last segment is the category path, the last segment is the article slug. API call changes from `/api/articles/by-slug/${slug}` to `/api/articles/by-path/${slugPath.join('/')}`.

### Category routes

Change `categories/[slug]/` to `categories/[...slugPath]/` for consistency with per-parent uniqueness.

### Link generation

The API includes a `categoryPath: string[]` field on article responses (populated via `buildCategoryPath`). Frontend builds links as `/articles/${categoryPath.join('/')}/${article.slug}`.

## RAG API & Search Changes

### RAG API (`POST /api/v1/rag/search`)

Add `categoryPath: string[]` to each result object. Populated via `buildCategoryPath(article.categoryId)`. Lets LLMs distinguish same-titled articles in different categories.

### Search (`GET /api/search`)

Add `categoryPath` to each search result so the frontend can build correct links. No changes to search logic itself — just response enrichment.

### Performance

N search results require N `buildCategoryPath` calls. Acceptable given shallow category trees (1-3 levels) and small category counts. Bulk fetch + in-memory path building is available as a future optimization if needed.
