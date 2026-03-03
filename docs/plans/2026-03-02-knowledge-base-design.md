# Dovetail Knowledge Base — Design Document

**Date:** 2026-03-02
**Status:** Approved

## Overview

Dovetail is a single-organization knowledge base platform tailored for legal content. It provides hierarchical wiki-style pages, version history, advanced and semantic search, and a RAG API for integration with third-party LLM applications (e.g. LibreChat).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (React, TypeScript) |
| Backend | Express (Node.js, TypeScript) |
| Database | PostgreSQL + pgvector extension |
| ORM | Drizzle ORM + postgres.js |
| Auth | Auth.js v5 (NextAuth) |
| Package manager | pnpm (workspaces monorepo) |
| Deployment | Docker Compose |

---

## Architecture

### Monorepo Layout

```
dovetail/
├── apps/
│   ├── web/          # Next.js frontend (React UI)
│   └── api/          # Express REST API
├── packages/
│   ├── types/        # Shared TypeScript interfaces
│   └── db/           # Drizzle schema + migrations
├── docker-compose.yml
├── docker-compose.override.yml
├── package.json      # pnpm workspace root
└── .env
```

### Runtime Flow

```
Browser → Next.js (web) → Express API → PostgreSQL
                     ↘ OAuth Provider (Google / Entra)
```

### Docker Compose Services

- `postgres` — PostgreSQL with pgvector extension, health-checked
- `api` — Express REST API, waits for postgres
- `web` — Next.js frontend

In development, only Postgres runs in Docker. `apps/web` and `apps/api` run via `pnpm dev` for hot reload.

---

## Data Model

### users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| email | text | unique |
| name | text | |
| avatar_url | text | |
| role | enum | `viewer`, `editor`, `admin` (global default) |
| provider | enum | `google`, `entra` |
| provider_id | text | OAuth subject identifier |
| created_at | timestamp | |

### categories
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| name | text | |
| slug | text | unique |
| parent_id | uuid | → categories.id (self-referential, nullable) |
| created_at | timestamp | |

### user_category_roles
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | → users.id |
| category_id | uuid | → categories.id |
| role | enum | `viewer`, `editor`, `admin` |

Primary key: `(user_id, category_id)`. Roles **cascade to subcategories** — permission check walks the ancestor chain (most specific wins), then falls back to the user's global role.

### articles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| title | text | |
| slug | text | unique |
| category_id | uuid | → categories.id |
| author_id | uuid | → users.id |
| content | jsonb | rich text (e.g. Tiptap JSON) |
| status | enum | `draft`, `published`, `archived` |
| search_vector | tsvector | auto-updated by Postgres trigger |
| created_at | timestamp | |
| updated_at | timestamp | |
| published_at | timestamp | nullable |

### article_versions
Append-only audit log — never updated, only inserted.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| article_id | uuid | → articles.id |
| title | text | snapshot |
| content | jsonb | snapshot |
| author_id | uuid | → users.id |
| version_number | integer | monotonically increasing |
| created_at | timestamp | |

### tags
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| name | text | |
| slug | text | unique |

### article_tags
| Column | Type | Notes |
|--------|------|-------|
| article_id | uuid | → articles.id |
| tag_id | uuid | → tags.id |

### article_embeddings
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| article_id | uuid | → articles.id |
| chunk_index | integer | order of chunk within article |
| chunk_text | text | the text that was embedded |
| embedding | vector | stored via pgvector |
| created_at | timestamp | |

---

## Authentication & RBAC

### OAuth Flow

Auth.js v5 (NextAuth) in `apps/web` handles the OAuth handshake with the configured provider. On successful login, it issues a JWT stored as an HTTP-only cookie.

Provider is selected by environment variable — no code changes required to switch:

```env
OAUTH_PROVIDER=google   # or "entra"
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# or
ENTRA_CLIENT_ID=...
ENTRA_CLIENT_SECRET=...
```

### API Authentication

Every request to the Express API goes through:

```
authMiddleware      → validates JWT, extracts user
requireRole(...)    → checks global + category-level role
route handler       → executes business logic
```

### Permission Resolution

For a given user + category:

1. Query `user_category_roles` walking up the ancestor chain via recursive CTE
2. Take the first (most specific) match
3. Fall back to `users.role` if no category override exists

---

## Search

### Full-Text Search

- Postgres `tsvector` column on `articles.search_vector`
- Auto-updated by a database trigger on insert/update
- Supports relevance ranking (`ts_rank`), prefix matching, AND/OR logic
- Advanced filters: category, author, tags, date range, status

### Semantic Search

- pgvector extension stores embeddings in `article_embeddings`
- Articles chunked into ~512-token overlapping segments on save
- Chunks embedded via configurable provider, stored as vectors
- Query-time: user query is embedded, cosine similarity search returns closest chunks

### Embedding Provider Config

```env
EMBEDDING_PROVIDER=openai       # or "ollama", "azure-openai"
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=...          # for self-hosted / Ollama
```

The API wraps the provider behind a common interface — swapping providers requires only `.env` changes.

---

## RAG API

Endpoint for third-party LLM applications (e.g. LibreChat):

```
POST /api/v1/rag/search
Authorization: Bearer <api-key>

{
  "query": "what are the notice requirements for contract termination?",
  "limit": 5
}
```

Returns ranked chunks with article title, source URL, and matching text. Access controlled by API keys managed by admins (separate from user OAuth).

---

## Build Sequence

Each phase produces working, testable software before the next begins.

| Phase | What you build | What you learn |
|-------|---------------|----------------|
| 1. Scaffold | Monorepo, pnpm workspaces, TypeScript config, Docker Compose with Postgres | Project structure, pnpm, Docker basics |
| 2. Database | Drizzle schema, migrations, postgres.js connection | Schema design, migrations, SQL basics |
| 3. Auth | NextAuth OAuth (Google or Entra), JWT, user table | OAuth flow, cookies, JWTs |
| 4. RBAC | Role middleware in Express, category-level permissions | Middleware, access control patterns |
| 5. Core API | Articles CRUD, categories, version history | REST API design, Express routing |
| 6. Frontend | Next.js pages: article list, article view, editor | React, Next.js data fetching |
| 7. Full-text search | tsvector, Postgres triggers, search endpoint | Postgres FTS, query building |
| 8. Semantic search | pgvector, embedding pipeline, configurable providers | Vector search, chunking, embeddings |
| 9. RAG API | API key auth, `/rag/search` endpoint, LibreChat integration | External API design |
| 10. Polish | Tags, advanced filters, admin UI, audit log | Putting it all together |
