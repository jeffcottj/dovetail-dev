# Phase 7: Full-Text Search — What We Built and Why

This document explains what was accomplished in Phase 7 of the Dovetail project, written for a non-technical audience.

## What is Phase 7?

Phase 7 adds search to Dovetail. Before this phase, users could browse categories and read articles, but had no way to find content by keyword. After Phase 7, users can type a query into a search bar and get ranked results from all published articles — powered by PostgreSQL's built-in full-text search engine.

## What We Built

### 1. Database Search Infrastructure (Task 7.1)

**The problem with searching JSON content:** Article content is stored as Tiptap JSON — a structured format that includes formatting metadata (headings, bold text, lists) alongside the actual words. Searching this raw JSON would match structural tokens like `"type": "paragraph"` instead of meaningful content.

**Plain text extraction:** We created a utility (`apps/api/src/utils/tiptap.ts`) that recursively walks the Tiptap JSON tree and extracts just the human-readable text. This runs every time an article is created or updated, storing the result in a new `plain_text` column on the articles table.

**How PostgreSQL full-text search works:** PostgreSQL has a built-in search engine that works in three layers:

1. **tsvector** — A preprocessed, indexed representation of text. PostgreSQL breaks the text into individual words (tokens), removes common words like "the" and "is" (stop words), and reduces words to their root form (stemming — so "running", "runs", and "ran" all become "run"). This processed form is stored in a `search_vector` column on the articles table.

2. **Trigger** — A database trigger automatically updates the `search_vector` column whenever the article's title or plain text changes. This means the search index is always up to date without the application needing to manage it explicitly.

3. **GIN index** — A specialised index structure (Generalized Inverted Index) that makes searching the tsvector column extremely fast, even with thousands of articles.

**SQL migration:** A manual SQL migration (`packages/db/migrations/0001_add_search_trigger.sql`) sets up the tsvector column, the trigger function, and the GIN index. This is a "manual" migration because it uses PostgreSQL-specific features (PL/pgSQL trigger functions) that Drizzle's schema generator can't produce automatically.

**Why this matters:** Search is handled entirely by the database, which means it's fast, reliable, and doesn't require external search services like Elasticsearch. The trigger-based approach ensures the search index can never drift out of sync with the actual content.

### 2. Search API Endpoint (Task 7.2)

**Endpoint:** `GET /api/search?q=tenant+rights&categoryId=...&authorId=...&from=...&to=...&page=1&limit=20`

**Query parsing:** The endpoint uses `websearch_to_tsquery` rather than the simpler `to_tsquery`. This is an important distinction — `websearch_to_tsquery` accepts natural-language queries. Users can type things like:

- `tenant rights` — finds articles containing both words
- `"tenant rights"` — finds the exact phrase
- `tenant -commercial` — finds "tenant" but excludes "commercial"

With `to_tsquery`, users would need to write `tenant & rights` — an unfriendly syntax nobody would guess.

**Ranking:** Results are ordered by `ts_rank`, PostgreSQL's relevance scoring function. Articles where the search terms appear more frequently and in more prominent positions (like the title) rank higher.

**Filtering:** Search results can be narrowed by category, author, and date range. All filters are combined with the full-text condition using AND logic. Only published articles appear in search results — drafts and archived articles are excluded.

**Pagination:** Results follow the same paginated response envelope (`{ data, total, page, limit }`) used by all other list endpoints in the API, ensuring consistency for the frontend.

**Why this matters:** A single endpoint handles keyword search with flexible filtering, returning ranked results that surface the most relevant content first.

### 3. Search UI (Task 7.3)

**Search bar:** A search input appears in the header of every page inside the main layout. Users type a query and press Enter to navigate to the search results page. The search bar is a client component (runs in the browser) so it can capture keyboard input and handle form submission without a full page reload.

**Results page:** The search results page (`/search?q=...`) displays a list of matching articles with their titles, last-updated dates, and pagination controls. The page is a server component — it fetches results from the API during server-side rendering, so the page loads with content already visible (no loading spinner for the initial results).

**Loading state:** A skeleton loading page shows placeholder shapes while results are being fetched, providing visual feedback during navigation.

**Design consistency:** The search results use the same visual patterns as category article lists — the same typography, spacing, hover effects, and link styles — so the experience feels cohesive.

**Why this matters:** Search is discoverable (always visible in the header) and fast (server-rendered results). Users can find content across the entire knowledge base without needing to know which category it's in.

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `apps/api/src/utils/tiptap.ts` | Extracts plain text from Tiptap JSON content |
| `apps/api/src/routes/search.ts` | `GET /api/search` endpoint with full-text search |
| `apps/api/src/__tests__/utils/tiptap.test.ts` | Tests for text extraction |
| `apps/api/src/__tests__/routes/search.test.ts` | Tests for search endpoint |
| `apps/web/components/SearchBar.tsx` | Client-side search input component |
| `apps/web/app/(main)/search/page.tsx` | Search results page |
| `apps/web/app/(main)/search/loading.tsx` | Loading skeleton for search |
| `packages/db/migrations/0001_add_search_trigger.sql` | SQL migration for tsvector, trigger, and GIN index |

### Modified files
| File | Change |
|------|--------|
| `packages/db/src/schema.ts` | Replaced `searchVector` text placeholder with `plainText` column |
| `packages/db/migrations/meta/_journal.json` | Registered new migration |
| `apps/api/src/routes/articles.ts` | Article create/update now populates `plain_text` |
| `apps/api/src/app.ts` | Mounted search router |
| `apps/web/app/(main)/layout.tsx` | Added SearchBar to header |

## How It All Connects

```
User types query → SearchBar (client component)
                      ↓ form submit
              /search?q=... page (server component)
                      ↓ apiFetch
              GET /api/search?q=... (Express)
                      ↓ SQL
              PostgreSQL: search_vector @@ websearch_to_tsquery(...)
                      ↓ ts_rank ordering
              Ranked results returned to page
```

The search index stays current because:
1. When an article is saved, the Express handler extracts plain text and writes it to `plain_text`
2. The PostgreSQL trigger detects the `plain_text` change and rebuilds `search_vector`
3. The GIN index updates automatically
4. The next search query hits the updated index

## What's Next

Phase 8 adds **semantic search** — using AI embeddings to find articles by meaning, not just keyword matching. This allows queries like "how to help someone facing eviction" to find relevant articles even if they don't contain those exact words. Phase 8 also introduces **hybrid search**, which combines full-text and semantic results for the best of both approaches.
