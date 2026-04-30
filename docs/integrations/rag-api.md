# RAG API

Dovetail exposes read-only RAG endpoints under `/api/v1/rag` for machine clients. These endpoints are the API boundary that the MCP server should use; MCP clients should not query the database directly.

## Authentication

Send a Dovetail API key as a Bearer token:

```http
Authorization: Bearer <dovetail-api-key>
```

API keys are scoped to one or more knowledge bases. Endpoints only return published content in the key's allowed KBs. Draft and archived articles are never returned.

## Endpoints

### List Allowed Knowledge Bases

```http
GET /api/v1/rag/knowledge-bases
```

Returns the KBs attached to the API key.

### List Categories

```http
GET /api/v1/rag/knowledge-bases/:kbId/categories
```

Returns categories for one allowed KB. Each category includes a `path` array for MCP clients that need citation-friendly locations.

### Search Chunks

```http
POST /api/v1/rag/search
Content-Type: application/json

{
  "query": "tenant repair remedies",
  "knowledgeBaseIds": ["<allowed-kb-id>"],
  "categoryIds": ["<optional-category-id>"],
  "limit": 5
}
```

Search returns article and attachment chunks with article URL, KB metadata, category path, last edited metadata, source type, score, and attachment filename when the source is an attachment.

### Get Published Article

```http
GET /api/v1/rag/articles/:articleId
```

Returns full published article content and metadata for an article in an allowed KB.

Path lookup is also available:

```http
GET /api/v1/rag/articles/by-path?knowledgeBaseSlug=<kb-slug>&path=<category-slugs>/<article-slug>
```

Use `knowledgeBaseId` instead of `knowledgeBaseSlug` when preferred.

### Get Article Citations

```http
GET /api/v1/rag/articles/:articleId/citations
```

Returns citation-ready metadata for article chunks and attachment chunks belonging to one published article.

### Suggest Related Articles

```http
POST /api/v1/rag/related-articles
Content-Type: application/json

{
  "query": "security deposit remedies",
  "knowledgeBaseIds": ["<allowed-kb-id>"],
  "limit": 5
}
```

The request can use `articleId` instead of `query` to find articles related to a specific published article. Results are article-level suggestions with the best matching snippet; full content remains available only from `GET /api/v1/rag/articles/:articleId`.

## MCP Notes

These endpoints are surfaced to MCP-capable clients (such as LibreChat) by the Dovetail MCP server (`apps/mcp`), which maps them to six read-only tools:

- `list_knowledge_bases`
- `list_categories`
- `search_articles`
- `get_article`
- `get_article_citations`
- `suggest_related_articles`

For MCP server configuration and operational notes, see [`docs/integrations/mcp.md`](./mcp.md). For end-to-end LibreChat setup, see [`docs/integrations/librechat.md`](./librechat.md). The REST endpoints documented above remain supported for legacy clients that do not speak MCP.
