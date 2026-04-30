# Step 11 Implementation Plan: MCP Server And LibreChat Docs

## Purpose

This plan covers step 11 from the suggested implementation order in `docs/product-gap-analysis.md`:

> Build the MCP server and LibreChat docs.

The goal is to wrap the read-only `/api/v1/rag/*` HTTP surface added in step 10 as a Model Context Protocol (MCP) server, package and ship it as a separate Docker Compose service authenticated to the Dovetail API by API key, and update the LibreChat integration documentation so operators can configure LibreChat against the MCP server instead of the raw RAG endpoint.

This step assumes step 10 is complete: API-key-scoped endpoints exist for KB listing, category listing, full article fetch, citation metadata, related article suggestions, and chunk search. The MCP server is a thin adapter over those endpoints. It must not query the database directly and must not introduce new permission semantics.

## Current Behavior

Relevant current behavior in this branch:

- No `apps/mcp` or `packages/mcp` exists. There is no MCP-related code anywhere in the monorepo.
- `docker-compose.yml` defines `postgres`, `api`, and `web` only. There is no `mcp` service.
- `docs/integrations/rag-api.md` documents `/api/v1/rag/*` and notes that MCP packaging is deferred to step 11.
- There is no LibreChat-specific docs file in `docs/integrations/`. Older worktrees contain a `librechat.md` that only documents the raw RAG REST endpoint and does not mention MCP, KB scoping, or attachment chunks.
- `apiKeyAuth` (`apps/api/src/middleware/apiKeyAuth.ts`) attaches `req.allowedKbIds` based on `api_key_knowledge_bases` rows. The MCP server will rely on this scoping by simply forwarding the configured key.
- Health checks exist for `postgres` and `api` (`/health`) but not for any MCP service.

Primary files to inspect or change:

- `apps/api/src/routes/rag.ts`
- `apps/api/src/middleware/apiKeyAuth.ts`
- `docs/integrations/rag-api.md`
- `docker-compose.yml`
- `pnpm-workspace.yaml`
- `packages/types/src/index.ts`
- `Justfile`
- `.env.example`
- `docs/product-gap-analysis.md`
- `docs/product-requirements.md`

New files to add (suggested layout):

- `apps/mcp/package.json`
- `apps/mcp/tsconfig.json`
- `apps/mcp/Dockerfile`
- `apps/mcp/src/index.ts`
- `apps/mcp/src/server.ts`
- `apps/mcp/src/api-client.ts`
- `apps/mcp/src/tools/list-knowledge-bases.ts`
- `apps/mcp/src/tools/list-categories.ts`
- `apps/mcp/src/tools/search-articles.ts`
- `apps/mcp/src/tools/get-article.ts`
- `apps/mcp/src/tools/get-article-citations.ts`
- `apps/mcp/src/tools/suggest-related-articles.ts`
- `apps/mcp/src/health.ts`
- `apps/mcp/src/__tests__/*.test.ts`
- `docs/integrations/librechat.md`
- `docs/integrations/mcp.md`

## Product Semantics To Implement

- The MCP server is a separate runtime service. It is a process distinct from the API and the web app.
- The MCP server authenticates to Dovetail using a single Dovetail API key supplied by configuration. KB scope is defined by what KBs that key is attached to in `api_key_knowledge_bases`. The MCP server does not implement its own KB scoping.
- The API is the only data and authorization boundary. The MCP server must not import `@dovetail/db`, must not connect to Postgres, and must not call any non-`/api/v1/rag/*` route.
- The MCP server exposes only the read-only tools listed in `docs/product-gap-analysis.md` section 10:
  - `list_knowledge_bases`
  - `list_categories`
  - `search_articles`
  - `get_article`
  - `get_article_citations`
  - `suggest_related_articles`
- Search-oriented tools (`search_articles`, `suggest_related_articles`) return snippet/chunk-oriented results. Full article content is reserved for `get_article`.
- Tool errors should be propagated to MCP clients with stable, human-readable messages. Authentication failures, missing articles, and out-of-scope KBs map to MCP tool errors rather than crashing the process.
- The MCP server should expose a simple HTTP health endpoint usable by Docker Compose healthchecks. Health does not require the upstream API to be reachable, but should optionally surface upstream reachability when easy.
- LibreChat (and any other MCP-capable client) should be the integration target. The MCP server should not include LibreChat-specific assumptions in its tool surface.

## Reproduction Recipe

Before implementation:

1. Run `just dev` and confirm `/api/v1/rag/*` endpoints from step 10 work with a seeded API key.
2. Inspect `docker-compose.yml` and confirm there is no `mcp` service.
3. Confirm there is no `apps/mcp` directory and no MCP package in `pnpm-workspace.yaml`.
4. Confirm `docs/integrations/` contains only `rag-api.md`.

After implementation:

1. Build and run the MCP service in Docker Compose alongside `api` and `postgres`.
2. Configure `MCP_API_BASE_URL` and `MCP_API_KEY` so the service can call the API.
3. From an MCP-capable client (LibreChat, an MCP test harness, or `apps/mcp` integration tests), call each of the six tools and confirm:
   - `list_knowledge_bases` returns only the KBs scoped to the configured API key.
   - `list_categories` requires a `knowledgeBaseId` and rejects out-of-scope KBs.
   - `search_articles` returns chunk-oriented results with article URL, KB metadata, category path, and last edited metadata.
   - `get_article` returns full article content for a published article in scope and errors for drafts, archived articles, or out-of-scope articles.
   - `get_article_citations` returns article and attachment chunk citations for a published article.
   - `suggest_related_articles` accepts either `articleId` or `query` and respects API-key KB scope.
4. Stop the API container and confirm tool calls return clear errors instead of hanging.
5. Confirm `docker compose ps` shows the MCP service healthy when API is healthy.
6. Read `docs/integrations/librechat.md` and follow it end-to-end against a fresh LibreChat instance.

## Implementation Plan

### 1. Decide Transport And SDK

Pick one transport for v1 and document it. Recommended:

- Use the official `@modelcontextprotocol/sdk` package (TypeScript) to avoid hand-rolling the protocol.
- Default to MCP over HTTP using the SDK's HTTP/streamable transport so the service can run inside Docker Compose, sit behind Caddy with the API and web, and be reachable by LibreChat without `stdio` plumbing.
- Optionally support `stdio` for local development and tests, but treat it as secondary.

Document the chosen transport in `docs/integrations/mcp.md`. Do not silently support multiple transports without testing each.

### 2. Add `apps/mcp` Workspace Package

Add a new app under `apps/mcp` so it ships with the rest of the monorepo and reuses shared types.

Required setup:

- `apps/mcp/package.json` with `name: "@dovetail/mcp"`, `private: true`, `type: "module"`, scripts for `dev`, `build`, `start`, and `test`. Mirror `apps/api`'s tooling (`tsx`, `tsc`, `vitest`).
- `apps/mcp/tsconfig.json` extending the repo `tsconfig.base.json`.
- Add `@dovetail/types` and `@dovetail/db` (only if `@dovetail/types` is insufficient — prefer types-only) as workspace dependencies. Do not add `@dovetail/db`. The MCP service must not depend on the database package.
- Add the MCP TypeScript SDK and a small HTTP client (`undici` or built-in `fetch`).
- Update `pnpm-workspace.yaml` only if required (`apps/*` is already covered).
- Add to root `package.json` test/build pipelines if those are explicit.

### 3. Build A Thin API Client

Add `apps/mcp/src/api-client.ts` that wraps the `/api/v1/rag/*` surface as typed functions:

- `listKnowledgeBases()`
- `listCategories(knowledgeBaseId: string)`
- `searchArticles(input)`
- `getArticle(articleId: string)`
- `getArticleByPath(input)` (if the by-path endpoint is shipped in step 10)
- `getArticleCitations(articleId: string)`
- `suggestRelatedArticles(input)`

Behavior details:

- Read `MCP_API_BASE_URL` and `MCP_API_KEY` once at startup. Fail fast at boot if either is missing; do not silently accept empty values.
- Send `Authorization: Bearer <MCP_API_KEY>` on every request.
- Map upstream `401`, `403`, `404`, and `400` responses to typed errors so the tool layer can produce stable MCP tool errors:
  - `401` → invalid or revoked API key.
  - `403` → API key does not allow this KB.
  - `404` → article missing, unpublished, or out of scope.
  - `400` → validation error; surface upstream `details` if present.
- Use a single shared `fetch` instance with a small request timeout. Do not implement retries beyond a simple connect retry; tools should fail fast.
- Reuse `RagKnowledgeBase`, `RagCategory`, `RagArticle`, `RagCitation`, `RagRelatedArticle`, and `RagSearchResult` from `packages/types` if step 10 added them. Add only the missing transport types there; do not duplicate them in `apps/mcp`.

### 4. Implement The Six MCP Tools

Add one file per tool under `apps/mcp/src/tools/`. Each tool should:

- Declare a clear, short `description` aimed at LLM tool selection. Avoid ambiguous wording. State that draft and archived articles are never returned and that results are constrained to KBs allowed by the configured API key.
- Define a strict Zod schema for inputs.
- Validate inputs and return MCP tool errors on validation failure rather than throwing.
- Call the API client and translate responses into MCP tool result content.

Tool surfaces:

- `list_knowledge_bases`
  - Input: none.
  - Output: array of `{ id, name, slug, description }`.
- `list_categories`
  - Input: `{ knowledgeBaseId: string }`.
  - Output: array of `{ id, name, slug, parentId, knowledgeBaseId, path }`.
- `search_articles`
  - Input: `{ query: string; knowledgeBaseIds?: string[]; categoryIds?: string[]; limit?: number }`.
  - Default `limit` to 5; cap at 20 even if the upstream allows more, to keep tool output small.
  - If `knowledgeBaseIds` is omitted, send no filter and let the API key's allowed KBs apply.
  - Output: chunk-oriented results with article URL, KB metadata, category path, last edited metadata, source type (`article` | `attachment`), attachment filename when relevant, and score.
- `get_article`
  - Input: `{ articleId: string }` or, optionally, `{ knowledgeBaseSlug: string; path: string }` if the API exposes by-path.
  - Output: full article content plus metadata. Include both rich text JSON and plain text if both are available.
- `get_article_citations`
  - Input: `{ articleId: string }`.
  - Output: article metadata plus an array of citation chunks covering both article and attachment sources.
- `suggest_related_articles`
  - Input: `{ articleId?: string; query?: string; knowledgeBaseIds?: string[]; categoryIds?: string[]; limit?: number }` with exactly one of `articleId` or `query`.
  - Output: article-level suggestions with best-matching snippet, score, KB and category path.

Keep each tool implementation small. The tool layer is glue between MCP request validation and the API client; it should not contain business logic.

### 5. Wire Tools Into An MCP Server

Add `apps/mcp/src/server.ts`:

- Construct the SDK server.
- Register all six tools.
- Add a startup banner that logs the API base URL and a redacted key fingerprint, but never the raw key.
- Refuse to start if `MCP_API_KEY` is missing or `MCP_API_BASE_URL` is not a valid URL.

Add `apps/mcp/src/index.ts`:

- Bootstrap the server, bind to `MCP_PORT` (default `3002`), and start the chosen transport.
- Wire process-level signal handling to shut down cleanly.
- Add a `/health` HTTP endpoint via `apps/mcp/src/health.ts` returning `200 ok` and JSON `{ status: 'ok', apiBaseUrl }`. Optionally include an upstream reachability probe behind a query param such as `/health?deep=1`.

### 6. Build A Dockerfile And Compose Service

Add `apps/mcp/Dockerfile`. Mirror the structure of `apps/api/Dockerfile`:

- Multi-stage Node 20 build.
- Build with `pnpm` workspace context so the package can resolve `@dovetail/types`.
- Final stage runs `node dist/index.js` as a non-root user.
- Expose the configured port (default `3002`).

Update `docker-compose.yml`:

- Add an `mcp` service with:
  - `build: { context: ., dockerfile: apps/mcp/Dockerfile }`.
  - Environment variables: `MCP_PORT`, `MCP_API_BASE_URL=http://api:3001`, `MCP_API_KEY` (from host env, no default), and any logging flag.
  - `depends_on: { api: { condition: service_healthy } }` once the API has a real healthcheck. Until then, `depends_on: api` is acceptable.
  - A healthcheck that hits `/health` on the MCP port.
  - Port mapping under a non-public default. The MCP service should be reachable by LibreChat but does not need to be exposed on `0.0.0.0` in dev unless required. Document the chosen exposure pattern.

Defer the Caddy fronting work to step 12 (Azure VM Compose/Caddy deployment). This step only needs the service to start cleanly under Compose.

### 7. Add Configuration And Secrets Plumbing

Add to `.env.example`:

```
# MCP server
MCP_PORT=3002
MCP_API_BASE_URL=http://localhost:3001
MCP_API_KEY=
```

Add a short note in `.env.example` explaining how to obtain `MCP_API_KEY` (admin UI → API Keys, scoped to the KBs LibreChat should access).

Add a Just recipe such as `just mcp-dev` or extend `just dev` to optionally include MCP. Keep `just dev` lean; do not require MCP for the default loop. Operators running the full stack should use `docker compose up --build` or a new `just mcp-up` recipe.

### 8. Tests

Aim for tests that exercise the tool layer against a mocked API client and a small set of integration tests against the real API.

Required coverage in `apps/mcp/src/__tests__/`:

- API client maps `401`, `403`, `404`, and `400` upstream responses to the documented error categories.
- Each tool validates its inputs and returns MCP tool errors for invalid bodies.
- Each tool calls the expected API path with the expected query/body.
- Each tool returns the expected output shape, asserted against snapshots or explicit field checks.
- `list_knowledge_bases` returns only what the API client returned (no client-side scoping).
- `search_articles` and `suggest_related_articles` cap `limit` to 20 and default to 5.
- `get_article` propagates `404` for drafts/archived/out-of-scope upstream responses.
- Health endpoint returns `200` with `MCP_API_KEY` configured and a clear error if missing at boot.

Optional integration tests (gated like `just smoke-ai`):

- Boot the MCP server against a running API and confirm at least one round-trip per tool succeeds with a seeded API key.

Run targeted checks:

```sh
pnpm --filter @dovetail/mcp test
pnpm --filter @dovetail/mcp build
```

If shared type changes are added:

```sh
pnpm --filter @dovetail/types build
```

### 9. Update Documentation

Add `docs/integrations/mcp.md`:

- Architecture overview: MCP server is a thin adapter over `/api/v1/rag/*`.
- Configuration: `MCP_API_BASE_URL`, `MCP_API_KEY`, `MCP_PORT`, transport choice.
- Tool reference for the six tools, including input schemas and example outputs.
- Operational notes: health endpoint, Docker Compose service, expected logs, common errors.
- Explicit statement that the MCP server does not connect to Postgres and inherits KB scope from the API key.

Add `docs/integrations/librechat.md`:

- Replace the older RAG-only LibreChat instructions (still present in worktrees) with an MCP-first guide.
- Step-by-step: create an admin API key, scope it to the right KBs, deploy the MCP service, point LibreChat at the MCP server, verify the six tools appear in LibreChat.
- Keep a short "direct RAG REST" section for legacy clients and link to `docs/integrations/rag-api.md`. Make clear MCP is the supported integration.
- Include a troubleshooting table covering: `401` from upstream API, `403` for KB scope, MCP service not reachable from LibreChat, drafts not appearing.
- Avoid duplicating the RAG endpoint reference; link to `rag-api.md` instead.

Update `docs/integrations/rag-api.md` "MCP Notes" section to link to `docs/integrations/mcp.md` and `docs/integrations/librechat.md`.

### 10. Update `product-gap-analysis.md` Status (Optional)

Once step 11 ships, the gap analysis sections "10. MCP Server" and the LibreChat parts of section "11. RAG API Completion" can be marked done. This is a documentation-only change and may be deferred to a follow-up cleanup PR. Do not block the implementation PR on it.

## Acceptance Criteria

- A running `mcp` Docker Compose service starts cleanly when given a valid `MCP_API_KEY` and an unreachable or absent key fails fast at boot.
- An MCP-capable client connecting to the MCP server can list and call each of the six tools.
- Each tool returns the documented shape and respects the API key's KB scope without any client-side scoping logic.
- The MCP service does not depend on `@dovetail/db` and never opens a database connection.
- LibreChat can be configured against the MCP server using only the documented environment variables and the steps in `docs/integrations/librechat.md`.
- Drafts and archived articles are never returned by any MCP tool.
- Health endpoint is consumed by the Compose healthcheck and reflects service readiness.
- Tests cover input validation, error mapping, and tool output shape for all six tools.

## Out Of Scope

- Caddy fronting and Azure VM deployment for MCP (step 12).
- Backup and restore for MCP service state — MCP is stateless beyond the configured key.
- Additional MCP tools beyond the six listed in `docs/product-gap-analysis.md` section 10.
- Per-user identity passthrough from LibreChat into Dovetail. The MCP server uses one configured API key; user-level enforcement is owned by Dovetail and reflected in the key's KB scope.
- Write or mutation tools.
- Embedding or ranking changes; the MCP server consumes whatever step 10's RAG endpoints expose.
- Replacing the RAG REST endpoints with MCP. The REST surface remains supported and documented for legacy clients.
