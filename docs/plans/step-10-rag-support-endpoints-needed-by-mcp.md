# Step 10 Implementation Plan: RAG Support Endpoints Needed By MCP

## Purpose

This plan covers step 10 from the suggested implementation order in `docs/product-gap-analysis.md`:

> Add RAG support endpoints needed by MCP.

The goal is to complete the read-only, API-key-authenticated HTTP surface that the future MCP server can use without querying the database directly. Step 10 should keep the API as the data and authorization boundary and leave the MCP server package, Docker service, and LibreChat MCP wiring for step 11.

## Current Behavior

Relevant current behavior in this branch:

- `apps/api/src/routes/rag.ts` exposes `POST /api/v1/rag/search`.
- `apiKeyAuth` validates Bearer API keys, rejects revoked keys, updates `lastUsedAt`, and attaches `req.allowedKbIds`.
- RAG search requires explicit `knowledgeBaseIds` and rejects KB IDs outside the API key scope.
- RAG search returns published article chunks and attachment chunks from `article_embeddings` and `attachment_embeddings`.
- RAG search already includes article URL, category path, source type, attachment metadata, and last edited metadata.
- There are no API-key-authenticated endpoints for allowed KB listing, category listing, full published article fetch, citation metadata fetch, or related article suggestions.
- Existing user-authenticated article/category/KB routes cannot be reused by MCP because they depend on session auth and user roles rather than API-key scopes.

Primary files to inspect before implementation:

- `apps/api/src/routes/rag.ts`
- `apps/api/src/middleware/apiKeyAuth.ts`
- `apps/api/src/__tests__/routes/rag.test.ts`
- `apps/api/src/__tests__/middleware/apiKeyAuth.test.ts`
- `apps/api/src/routes/articles.ts`
- `apps/api/src/routes/categories.ts`
- `apps/api/src/routes/knowledge-bases.ts`
- `apps/api/src/services/search.ts`
- `apps/api/src/utils/category-path.ts`
- `packages/db/src/schema.ts`
- `packages/types/src/index.ts`
- `docs/product-requirements.md`
- `docs/product-gap-analysis.md`

## Product Semantics To Implement

- All new endpoints are read-only and authenticated with the same Dovetail API keys used by `POST /api/v1/rag/search`.
- API keys are scoped only by KB. They do not have category-specific scopes.
- Every endpoint must intersect requested KB IDs with `req.allowedKbIds`; out-of-scope KBs and articles should return `403` or `404` consistently with the endpoint contract.
- Only published articles are returned. Draft and archived articles must never be visible through machine-client endpoints.
- The API should return enough metadata for MCP tools to cite sources without needing extra database access:
  - KB ID, KB name, and KB slug.
  - category ID and category path.
  - article ID, title, slug, URL, status, updated time, published time.
  - last edited by ID, name, and email.
  - source type, chunk index, attachment ID, and attachment filename where relevant.
- Search-oriented endpoints should stay chunk/snippet oriented. Full article content should only be returned by the full article endpoint.
- Endpoint response shapes should be stable enough for the MCP server to map directly to tools:
  - `list_knowledge_bases`
  - `list_categories`
  - `search_articles`
  - `get_article`
  - `get_article_citations`
  - `suggest_related_articles`

## Reproduction Recipe

Before implementation:

1. Run `just dev`.
2. Use a seeded or admin-created API key scoped to one KB.
3. Call `POST /api/v1/rag/search` with the key and an allowed `knowledgeBaseIds` value; confirm search works.
4. Try to list allowed KBs through a machine-client endpoint such as `GET /api/v1/rag/knowledge-bases`.
5. Try to list categories through a machine-client endpoint such as `GET /api/v1/rag/knowledge-bases/<kbId>/categories`.
6. Try to fetch a full published article through a machine-client endpoint such as `GET /api/v1/rag/articles/<articleId>`.
7. Observe these endpoints do not exist.

After implementation:

1. Repeat the same calls with a valid API key scoped to the target KB.
2. Confirm KB and category listing returns only allowed KB data.
3. Confirm a published article in the allowed KB can be fetched by ID and by path if path lookup is included.
4. Confirm a draft or archived article returns `404`.
5. Confirm an article in a disallowed KB returns `403` or `404`, according to the finalized contract.
6. Confirm citation metadata can be returned for an article chunk and attachment chunk returned by RAG search.
7. Confirm related article suggestions exclude drafts, archived articles, and disallowed KBs.
8. Confirm the existing `POST /api/v1/rag/search` contract still passes for article and attachment chunks.

## Implementation Plan

### 1. Define The Machine-Client Contract

Keep all step 10 endpoints under `/api/v1/rag` so the MCP server has one API-key-authenticated base path.

Recommended endpoints:

- `GET /api/v1/rag/knowledge-bases`
  - Lists KBs attached to the API key.
- `GET /api/v1/rag/knowledge-bases/:kbId/categories`
  - Lists categories for one allowed KB, preferably as a flat list with `parentId` plus `path`, or as a tree if that is more convenient for MCP.
- `GET /api/v1/rag/articles/:articleId`
  - Returns full published article content and metadata when the article belongs to an allowed KB.
- `GET /api/v1/rag/articles/by-path`
  - Optional but useful for MCP and docs. Query params: `knowledgeBaseId` or `knowledgeBaseSlug`, `path`.
- `GET /api/v1/rag/articles/:articleId/citations`
  - Returns citation-ready source metadata for article chunks and attachment chunks for a published article.
- `POST /api/v1/rag/related-articles`
  - Accepts either `articleId` or `query`, plus optional `knowledgeBaseIds`, `categoryIds`, and `limit`.

Use Zod schemas for params, query strings, and bodies. Keep response shapes explicit in route code or shared local helpers instead of leaking raw Drizzle rows.

### 2. Add Shared API-Key Scope Helpers

Add small helpers inside `apps/api/src/routes/rag.ts` or a dedicated service such as `apps/api/src/services/rag-access.ts`:

- `getAllowedKbIds(req)`
- `assertAllowedKb(req, kbId)`
- `filterAllowedKbIds(req, requestedKbIds?)`
- `loadPublishedArticleForApiKey(articleId, allowedKbIds)`
- `buildMachineArticleUrl(kbSlug, categoryPath, articleSlug)`

Behavior details:

- Missing API key remains `401` through `apiKeyAuth`.
- A requested KB outside `req.allowedKbIds` should return `403` for explicit KB list/search requests.
- Article lookups should prefer `404` when the article is missing, unpublished, archived, or outside the key's scope, unless a specific endpoint already promises `403` for explicit out-of-scope KB access.
- Empty API-key scope should return empty KB/category/search results and `404` for article lookups.

Do not reuse session-auth permission helpers for API-key authorization. API keys have their own KB-scope model and should not inherit global viewer/editor/admin semantics.

### 3. Implement Allowed KB Listing

Add `GET /api/v1/rag/knowledge-bases`:

- Join `knowledge_bases` to `api_key_knowledge_bases` or filter by `req.allowedKbIds`.
- Return `id`, `name`, `slug`, `description`, and `createdAt`.
- Exclude `defaultAccess` unless the MCP server has a concrete need for it; API-key scope is already explicit.
- Sort by KB name for deterministic tool output.

Add tests:

- `401` without key.
- `200` with only scoped KBs.
- Revoked key remains rejected through existing middleware coverage.
- Empty scope returns `[]`.

### 4. Implement Category Listing

Add `GET /api/v1/rag/knowledge-bases/:kbId/categories`:

- Validate `kbId` as UUID.
- Require `kbId` to be in `req.allowedKbIds`.
- Return categories scoped to that KB only.
- Include `id`, `name`, `slug`, `parentId`, `knowledgeBaseId`, and `path`.
- Sort by path or parent/name so clients receive stable output.

If returning a tree, still include each node's full path. MCP tools benefit from a path without having to reconstruct ancestors.

Add tests:

- Allowed KB returns categories.
- Disallowed KB returns `403`.
- Unknown but syntactically valid KB returns `403` if not in the key scope, or `404` if the key is scoped to it but it no longer exists.
- Categories from other KBs are excluded.

### 5. Implement Full Published Article Fetch

Add `GET /api/v1/rag/articles/:articleId`:

- Validate `articleId` as UUID.
- Join `articles`, `categories`, `knowledge_bases`, and `users` for last-editor metadata.
- Require `articles.status = 'published'`.
- Require the article's KB to be in `req.allowedKbIds`.
- Return full article content and plain text if needed by MCP, plus metadata:
  - `id`, `title`, `slug`, `content`, `plainText`, `updatedAt`, `publishedAt`.
  - `knowledgeBase`.
  - `categoryId`, `categoryPath`.
  - `articleUrl`.
  - `lastEditedBy`.

Keep attachments out of this response unless only lightweight attachment metadata is included. Attachment content should remain represented through search chunks and citation metadata.

Optionally add `GET /api/v1/rag/articles/by-path`:

- Accept `knowledgeBaseSlug` plus `path`, or `knowledgeBaseId` plus `path`.
- Resolve category path with `resolveCategoryPath()`.
- Apply the same published and API-key scope checks as article ID lookup.

Add tests:

- Published article in allowed KB returns full content.
- Draft article returns `404`.
- Archived article returns `404`.
- Published article in disallowed KB returns `404`.
- Response includes URL, category path, and last edited metadata.

### 6. Implement Citation Metadata Endpoint

Add `GET /api/v1/rag/articles/:articleId/citations`.

Response shape should support citations for both article chunks and attachment chunks:

```ts
{
  article: {
    id: string;
    title: string;
    url: string;
    knowledgeBase: { id: string; name: string; slug: string };
    categoryPath: string[];
    lastEditedAt: string;
    lastEditedBy: { id: string; name: string; email: string } | null;
  };
  chunks: Array<{
    sourceType: 'article' | 'attachment';
    chunkIndex: number;
    chunkText: string;
    attachmentId: string | null;
    attachmentFilename: string | null;
  }>;
}
```

Implementation details:

- Load the article through the same published/API-key scoped helper as `get_article`.
- Read `article_embeddings` for article chunk citations.
- Read `attachment_embeddings` joined through `attachments` for attachment chunk citations.
- Sort by `sourceType`, attachment filename, then `chunkIndex`.
- Consider a `sourceType` query param later if the response becomes too large. For the first pass, keep it simple and complete for one article.

Add tests:

- Returns article and attachment citation rows for an allowed published article.
- Excludes citations for draft/archived articles.
- Excludes citations for disallowed KBs.
- Handles articles with no embeddings by returning an empty `chunks` array with article metadata.

### 7. Implement Related Article Suggestions

Add `POST /api/v1/rag/related-articles`.

Request shape:

```ts
{
  articleId?: string;
  query?: string;
  knowledgeBaseIds?: string[];
  categoryIds?: string[];
  limit?: number;
}
```

Validation:

- Require exactly one of `articleId` or `query`.
- Default `limit` to a small value such as `5`; cap at `20`.
- If `knowledgeBaseIds` is omitted, search all KBs allowed by the API key.
- If `knowledgeBaseIds` is provided, reject any disallowed KB with `403`.

Suggested implementation:

- For `query`, delegate to the existing RAG search path and collapse chunk hits into distinct article suggestions.
- For `articleId`, load the published article in scope, then use its title plus `plainText` excerpt as the related-query seed, or average its article embedding chunks if that is straightforward.
- Exclude the seed `articleId` from suggestions.
- Return article-level cards, not full content:
  - article ID, title, URL, KB metadata, category path, snippet or best chunk, score, source type.

Avoid creating a separate ranking system unless needed. Reusing the existing semantic retrieval query keeps this endpoint aligned with RAG search.

Add tests:

- Query-based related suggestions return published articles in allowed KBs.
- Article-based suggestions exclude the source article.
- Disallowed requested KB returns `403`.
- Draft and archived articles are not returned.
- Attachment chunk hits collapse to the parent article with source metadata preserved for the best hit.

### 8. Refactor RAG Search Formatting To Avoid Duplication

The new endpoints will need the same metadata that `POST /api/v1/rag/search` already builds:

- category path.
- KB slug and article URL.
- last edited metadata.
- source type and attachment metadata.

Extract small local helpers before adding more route logic:

- `formatRagChunk(row)`
- `loadCategoryPathAndKb(categoryId)`
- `formatArticleMetadata(row)`
- `getScopedKnowledgeBaseIds(req, requestedIds)`

Keep the refactor narrow. Do not move the entire search service unless duplication becomes hard to reason about.

Add a regression test around existing `/search` response fields before or during the refactor so helper changes do not silently drop attachment metadata or last edited metadata.

### 9. Add Shared Types Where Useful

Extend `packages/types/src/index.ts` only for response shapes that will be consumed by the future MCP app or web/admin code.

Suggested types:

- `RagKnowledgeBase`
- `RagCategory`
- `RagArticle`
- `RagCitation`
- `RagRelatedArticle`
- `RagSearchResult` if the existing search response remains untyped

Keep these as transport types with `Date | string` where existing shared types already follow that pattern.

### 10. Update Documentation

Add or update docs for machine-client RAG endpoints. If `docs/integrations/librechat.md` does not exist in the branch, add a focused API reference under `docs/integrations/rag-api.md` or another existing docs location.

Document:

- Authentication header format.
- API-key KB scoping behavior.
- Existing `POST /api/v1/rag/search` body, including required `knowledgeBaseIds`.
- New KB/category/article/citation/related endpoints.
- Example responses with article and attachment source metadata.
- Note that MCP service configuration belongs to step 11.

### 11. Add Focused Tests

Expand `apps/api/src/__tests__/routes/rag.test.ts` rather than creating many separate test files.

Required coverage:

- API-key auth is required for every new endpoint.
- KB list returns only scoped KBs.
- Category list rejects disallowed KBs and excludes other KB categories.
- Full article fetch returns only published articles in scoped KBs.
- Full article fetch includes URL, category path, and last edited metadata.
- Citation endpoint returns article and attachment chunks.
- Related endpoint handles both query and article modes.
- Related endpoint rejects invalid bodies and disallowed KBs.
- Existing search endpoint still returns article chunks, attachment chunks, last edited metadata, and `403` for disallowed requested KBs.

Run targeted checks:

```sh
pnpm --filter @dovetail/api test -- src/__tests__/routes/rag.test.ts src/__tests__/middleware/apiKeyAuth.test.ts
```

If shared type changes are added:

```sh
pnpm --filter @dovetail/types build
```

## Acceptance Criteria

- A machine client with a valid API key can discover its allowed KBs.
- A machine client can list categories for an allowed KB and cannot list categories for a disallowed KB.
- A machine client can fetch full content for a published article in an allowed KB.
- Machine clients cannot fetch draft or archived articles through any RAG support endpoint.
- Citation metadata covers both article and attachment chunks.
- Related article suggestions work by query and by article ID while respecting API-key KB scope.
- Existing RAG search behavior remains backward compatible.
- No new endpoint queries or exposes data outside the API key's KB scope.
- Documentation gives enough information for step 11 to build the MCP server without reverse-engineering route behavior.

## Out Of Scope

- Building the MCP server package or service.
- Docker Compose changes for MCP.
- LibreChat MCP configuration.
- Per-user identity passthrough from LibreChat.
- Category-scoped API keys.
- Write tools or mutation endpoints.
- New embedding or ranking architecture beyond what related suggestions require.
