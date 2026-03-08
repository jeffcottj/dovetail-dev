# Phase 9: RAG API — What We Built and Why

This document explains what was accomplished in Phase 9 of the Dovetail project, written for a non-technical audience.

## What is Phase 9?

Phase 8 gave Dovetail semantic search — users can find articles by meaning, not just keywords. Phase 9 makes that same capability available to **LLM applications** (like LibreChat) through a dedicated API endpoint. An LLM can now query Dovetail's knowledge base and receive article chunks formatted for inclusion in its context window. This is called **Retrieval-Augmented Generation (RAG)** — the LLM retrieves relevant knowledge before generating its response.

The key difference from the user-facing search: the RAG API uses **API key authentication** instead of user login cookies. This allows automated systems to query Dovetail without a browser session.

## What We Built

### 1. API Keys Table and Schema (Task 9.1, Part 1)

**The problem:** The existing authentication system uses OAuth (Google/Entra) — a user logs in via a browser, gets a session cookie, and that cookie authenticates API requests. An LLM application like LibreChat can't log in through a browser. It needs a static credential it can include in every request.

**The solution:** API keys. An admin creates a key in Dovetail, copies the raw key value (shown only once), and configures it in LibreChat. Every request from LibreChat includes this key in the `Authorization` header.

**How keys are stored:** The raw API key is never stored in the database. Instead, we store a SHA-256 hash of the key. When a request arrives, we hash the provided key and look up the hash. This means if the database were compromised, the actual keys would not be exposed — an attacker would only have hashes, which can't be reversed back into working keys.

The `api_keys` table tracks:
- **name** — A human-readable label (e.g., "LibreChat production")
- **key_hash** — The SHA-256 hash of the actual key
- **created_by** — Which admin created it
- **last_used_at** — When the key was last used (updated automatically)
- **revoked_at** — When/if the key was revoked (null means active)

### 2. API Key Authentication Middleware (Task 9.1, Part 2)

**Why a separate middleware?** The existing auth middleware (`authMiddleware`) expects JWE-encrypted session tokens from Auth.js. If you send a plain API key as a Bearer token, it tries to decrypt it as a JWE, fails, and returns 401. The RAG endpoint needs its own authentication path.

**How it works:**
1. Extract the Bearer token from the `Authorization` header
2. Hash it with SHA-256
3. Look up the hash in the `api_keys` table
4. Reject if the key is missing, not found, or revoked
5. Update `last_used_at` (fire-and-forget — doesn't slow down the response)
6. Allow the request to proceed

**Why this matters:** The two auth systems are completely separate. User OAuth and API key auth never interfere with each other. The existing user-facing search endpoint continues to use OAuth, while the RAG endpoint uses API keys.

### 3. Admin API Key Management (Task 9.1, Part 3)

Three endpoints let admins manage API keys:

- **`POST /api/admin/api-keys`** — Create a new key. Returns the raw key exactly once. After this response, the raw key is never available again (only its hash is stored). If you lose the key, you must revoke it and create a new one.

- **`GET /api/admin/api-keys`** — List all keys with their name, creation date, last-used date, and revocation status. Never shows the raw key.

- **`DELETE /api/admin/api-keys/:id`** — Revoke a key. Sets `revoked_at` to the current time. The key immediately stops working, but the record is kept for audit purposes.

All three endpoints require the `admin` role.

### 4. RAG Search Endpoint (Task 9.2)

**`POST /api/v1/rag/search`** — The core endpoint that LLM applications call.

**Request format:**
```json
{
  "query": "what are a tenant's rights when facing eviction",
  "limit": 5,
  "categoryIds": ["optional-uuid-to-filter-by-category"]
}
```

**How it works:**
1. Authenticate the request using the API key middleware
2. Validate the request body (query is required, limit defaults to 5, max 50)
3. Embed the query text into a vector using the same embedding provider as Phase 8
4. Search the `article_embeddings` table using pgvector cosine similarity
5. Only return chunks from **published** articles
6. Optionally filter by category IDs
7. Return results formatted for LLM consumption

**Response format:**
```json
{
  "results": [
    {
      "articleId": "uuid",
      "articleTitle": "Notice Requirements",
      "articleUrl": "/articles/notice-requirements",
      "chunkText": "Tenants have the right to receive written notice...",
      "score": 0.94
    }
  ]
}
```

Each result includes:
- **articleTitle** and **articleUrl** — so the LLM can cite its sources
- **chunkText** — the actual text content to include in the LLM's context
- **score** — cosine similarity (0 to 1), indicating how relevant the chunk is to the query

**Why this format?** LLMs work best when given focused, relevant text chunks rather than entire articles. The response is designed to be directly usable as context in a prompt. Including the article title and URL lets the LLM produce citations in its responses.

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `packages/db/src/schema.ts` (modified) | Added `apiKeys` table definition |
| `packages/db/migrations/0002_add_api_keys.sql` | Migration to create the `api_keys` table |
| `apps/api/src/middleware/apiKeyAuth.ts` | API key authentication middleware |
| `apps/api/src/routes/admin/api-keys.ts` | Admin CRUD endpoints for API key management |
| `apps/api/src/routes/rag.ts` | RAG search endpoint |
| `apps/api/src/__tests__/middleware/apiKeyAuth.test.ts` | Tests for API key auth (4 tests) |
| `apps/api/src/__tests__/routes/admin/api-keys.test.ts` | Tests for admin key management (9 tests) |
| `apps/api/src/__tests__/routes/rag.test.ts` | Tests for RAG search (6 tests) |
| `docs/integrations/librechat.md` | Integration guide for LibreChat |

### Modified files
| File | Change |
|------|--------|
| `apps/api/src/app.ts` | Mounted admin API key routes and RAG router |
| `packages/db/migrations/meta/_journal.json` | Registered new migration |

## How It All Connects

```
Admin creates API key → Raw key shown once → Admin configures in LibreChat
                              ↓
                        SHA-256 hash stored in api_keys table
                              ↓
LibreChat sends query → POST /api/v1/rag/search
                              ↓
                    API key middleware verifies hash
                              ↓
                    Query text embedded into vector
                              ↓
                    pgvector cosine similarity search on article_embeddings
                              ↓
                    Top-K chunks returned with article metadata
                              ↓
                    LibreChat includes chunks in LLM prompt
                              ↓
                    LLM generates response grounded in Dovetail's knowledge base
```

**The security model:**
- API keys are separate from user accounts — revoking a key doesn't affect any user
- Keys are hashed before storage — a database breach doesn't expose working keys
- Only admins can create, list, or revoke keys
- `last_used_at` tracking lets admins identify unused keys for cleanup
- Only published articles are returned — draft and archived content is never exposed through the RAG API

## What's Next

Phase 10 adds tags, the admin UI for managing users and API keys, production Docker images, and an end-to-end smoke test.
