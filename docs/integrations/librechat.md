# Integrating Dovetail with LibreChat

This guide explains how to connect LibreChat to Dovetail's RAG API so that LLM conversations can reference your organization's legal knowledge base.

## Prerequisites

- A running Dovetail instance (e.g., `https://dovetail.example.com`)
- Admin access to Dovetail (to create an API key)
- A LibreChat instance with RAG endpoint configuration support

## Step 1: Create a RAG API Key

1. Log in to Dovetail as an admin
2. Navigate to the admin panel and go to API Keys management
3. Click "Create API Key" and give it a descriptive name (e.g., "LibreChat Production")
4. **Copy the key immediately** — it is shown only once and cannot be retrieved later
5. Store the key securely (e.g., in your secrets manager or environment variables)

Alternatively, create a key via the API:

```bash
curl -X POST https://dovetail.example.com/api/admin/api-keys \
  -H "Cookie: authjs.session-token=<your-admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"name": "LibreChat Production"}'
```

The response includes a `key` field — save this value.

## Step 2: Configure LibreChat

Add the Dovetail RAG endpoint to your LibreChat configuration. The exact configuration depends on your LibreChat version, but the key settings are:

| Setting | Value |
|---------|-------|
| RAG Endpoint URL | `https://dovetail.example.com/api/v1/rag/search` |
| HTTP Method | `POST` |
| Authentication | `Bearer <your-api-key>` |

### Environment variables

```bash
RAG_API_URL=https://dovetail.example.com/api/v1/rag/search
RAG_API_KEY=<your-dovetail-api-key>
```

## Step 3: Test the Connection

Verify the integration works by making a direct request:

```bash
curl -X POST https://dovetail.example.com/api/v1/rag/search \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"query": "what are tenant rights in Maryland", "limit": 5}'
```

Expected response:

```json
{
  "results": [
    {
      "articleId": "...",
      "articleTitle": "Tenant Rights Overview",
      "articleUrl": "/articles/tenant-rights-overview",
      "chunkText": "Under Maryland law, tenants have the right to...",
      "score": 0.94
    }
  ]
}
```

## API Reference

### `POST /api/v1/rag/search`

**Headers:**
- `Authorization: Bearer <api-key>` (required)
- `Content-Type: application/json`

**Request body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | The search query (1-5000 characters) |
| `limit` | integer | No | 5 | Maximum number of chunks to return (1-50) |
| `categoryIds` | string[] | No | — | Filter results to specific categories (UUIDs) |

**Response:**

```json
{
  "results": [
    {
      "articleId": "uuid",
      "articleTitle": "string",
      "articleUrl": "/articles/slug",
      "chunkText": "string",
      "score": 0.0-1.0
    }
  ]
}
```

- `score` is cosine similarity between the query embedding and the chunk embedding (higher = more relevant)
- Only chunks from **published** articles are returned
- Results are ordered by relevance (highest score first)

## Filtering by Category

If your knowledge base has multiple content areas, you can restrict RAG results to specific categories:

```json
{
  "query": "eviction notice requirements",
  "limit": 5,
  "categoryIds": ["category-uuid-1", "category-uuid-2"]
}
```

This is useful when different LibreChat instances or channels should only access certain parts of the knowledge base.

## Managing API Keys

### List all keys
```bash
curl https://dovetail.example.com/api/admin/api-keys \
  -H "Cookie: authjs.session-token=<admin-session>"
```

### Revoke a key
```bash
curl -X DELETE https://dovetail.example.com/api/admin/api-keys/<key-id> \
  -H "Cookie: authjs.session-token=<admin-session>"
```

Revoked keys stop working immediately. Create a new key and update LibreChat's configuration if you need to rotate credentials.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| 401 Missing API key | No `Authorization` header | Add `Authorization: Bearer <key>` header |
| 401 Invalid or revoked API key | Key not found or was revoked | Create a new key and update configuration |
| 400 Validation error | Request body malformed | Check that `query` is a non-empty string |
| Empty results | No published articles match, or embeddings not generated | Ensure articles are published and embedding generation has completed |
