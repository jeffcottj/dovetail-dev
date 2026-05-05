# MCP Server

Dovetail ships a Model Context Protocol (MCP) server in `apps/mcp` that wraps the read-only `/api/v1/rag/*` REST surface. MCP-capable clients such as LibreChat connect to it instead of crafting raw RAG requests.

## Architecture

```
LibreChat ──MCP/HTTP──> dovetail-mcp ──HTTPS+API key (forwarded)──> dovetail-api ──> Postgres
```

- The MCP server is a separate process that runs as its own Docker Compose service.
- Inbound and upstream auth use **the same token**: external clients present a Dovetail admin-issued API key as `Authorization: Bearer …` on `/mcp` requests, and the MCP server forwards that exact token verbatim when calling the Dovetail RAG API.
- The MCP server owns no secrets — it has no upstream key of its own and does not validate inbound tokens beyond requiring the `Bearer` scheme. Validity, revocation, and per-KB scoping are enforced downstream by the RAG API against the `api_keys` table on every request.
- Multiple agents = multiple admin-issued keys. Issue one key per integration and scope each to the KBs that agent should reach. `/admin/api-keys` is the only place keys are created.
- It does not connect to Postgres and does not import `@dovetail/db`. The API is the only data and authorization boundary.

## Configuration

All configuration is via environment variables (see `.env.example`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `MCP_API_BASE_URL` | yes | — | Base URL of the Dovetail API, e.g. `http://api:3001` inside Docker Compose or `https://dovetail.example.com` in production. |
| `MCP_PORT` | no | `3002` | Port the MCP server listens on. |
| `MCP_REQUEST_TIMEOUT_MS` | no | `15000` | Timeout for upstream API requests. |

The server refuses to start if `MCP_API_BASE_URL` is missing or invalid. There is no per-deployment shared secret on the MCP server itself — credentials are issued per agent at `/admin/api-keys`.

## Transport

The MCP server speaks the official MCP **Streamable HTTP** transport at `POST /mcp`, with `GET /mcp` and `DELETE /mcp` reserved for stream and session lifecycle. Each connecting client receives a session ID via the `mcp-session-id` response header during initialization and must include it on subsequent requests.

The bearer token presented at `initialize` is bound to the resulting session. Subsequent requests carrying the same session ID must present the same token; mismatches are rejected with `401`. This prevents session-id piggybacking — a client cannot initialize with key A and then drive that session with key B. Idle sessions are evicted after 30 minutes of inactivity.

`stdio` transport is not exposed in production. For local experimentation, launch the process under an MCP test harness that speaks Streamable HTTP.

## Health

```
GET /health           → { status, apiBaseUrl, inboundAuth: "bearer" }
GET /health?deep=1    → adds upstreamReachable: true|false
```

`/health` is unauthenticated for liveness probing. The Compose healthcheck hits the cheap variant. The `?deep=1` form makes one round trip to the API's own `/health` and reports whether the upstream is reachable. It does not exercise an API key — auth is per-request and per-agent.

## Tools

All tools are read-only. Drafts and archived articles are never returned. KB scope is enforced by the API key the client presents; tool calls outside that scope error with `forbidden`.

### `list_knowledge_bases`

No input. Returns `{ knowledgeBases: [{ id, name, slug, description, createdAt }] }` for KBs allowed by the presented API key.

### `list_categories`

Input:

```json
{ "knowledgeBaseId": "uuid" }
```

Returns `{ knowledgeBaseId, categories: [{ id, name, slug, parentId, knowledgeBaseId, path }] }`. The KB must be in scope; otherwise the tool errors with `forbidden`.

### `search_articles`

Input:

```json
{
  "query": "tenant repair remedies",
  "knowledgeBaseIds": ["uuid"],
  "categoryIds": ["uuid"],
  "limit": 5
}
```

`knowledgeBaseIds` is optional. When omitted, the MCP server expands it to every KB allowed by the presented API key (via `list_knowledge_bases`). `limit` defaults to `5` and is capped at `20`.

Returns chunk-oriented results with `articleUrl`, `knowledgeBase`, `categoryPath`, last edited metadata, `sourceType` (`article` | `attachment`), `attachmentFilename` when relevant, `chunkText`, and `score`.

### `get_article`

Input variant 1:

```json
{ "articleId": "uuid" }
```

Input variant 2:

```json
{ "knowledgeBaseSlug": "kb-slug", "path": "category-slug/sub-slug/article-slug" }
```

Use `knowledgeBaseId` instead of `knowledgeBaseSlug` if you have the UUID. Drafts, archived articles, and out-of-scope articles return `not_found`.

Returns `{ article }` with full Tiptap JSON content, plain text, KB metadata, category path, article URL, timestamps, and last edited info.

### `get_article_citations`

Input:

```json
{ "articleId": "uuid" }
```

Returns `{ article, chunks }`. `chunks` covers both article body chunks and attachment chunks. Each chunk has `sourceType`, `chunkIndex`, `chunkText`, plus `attachmentId` and `attachmentFilename` when sourced from an attachment.

### `suggest_related_articles`

Input variant 1:

```json
{ "articleId": "uuid", "limit": 5 }
```

Input variant 2:

```json
{ "query": "security deposits", "knowledgeBaseIds": ["uuid"], "limit": 5 }
```

Exactly one of `articleId` or `query` is required. `limit` defaults to `5` and is capped at `20`. Results are article-level — full content remains available only via `get_article`.

## Operational notes

- The service is stateless beyond per-session MCP transport state. Restart freely.
- The MCP server never logs presented bearer tokens.
- Errors from the upstream API map to MCP tool errors:
  - `401` → "API key is missing, invalid, or revoked."
  - `403` → "API key does not have access to the requested knowledge base."
  - `404` → "Resource was not found, is unpublished, or is outside scope."
  - `400` → validation error with upstream `details` if available.
  - Network failures → "Could not reach the Dovetail API."
- Revocation propagates within one tool call: every MCP tool call triggers a fresh RAG request, which re-checks the key against the `api_keys` table. Revoking a key in the admin UI takes effect on the next tool call. Already-open SSE GET streams remain open until they close naturally; a revoked-but-open session can no longer make tool calls.

## Local development

```bash
# Use just (preferred)
just mcp-dev

# Or directly
pnpm --filter @dovetail/mcp dev
```

You will need a running API (`just dev`). To exercise the MCP server end-to-end, create at least one API key at `/admin/api-keys` and present it as `Authorization: Bearer <key>` on `/mcp` requests.

To run inside Docker Compose alongside the rest of the stack:

```bash
just mcp-up      # only the mcp service
docker compose up --build   # full stack including mcp
```

## Out of scope

- Per-user identity passthrough from the MCP client. The MCP server forwards whatever API key the client presents; user-level enforcement happens in Dovetail and is reflected in that key's KB scope.
- Write or mutation tools.
