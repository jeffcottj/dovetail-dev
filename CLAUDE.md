# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Dovetail is a single-organization legal knowledge base platform. It provides hierarchical wiki-style pages, version history, advanced and semantic search, and a RAG API for LLM integration (e.g. LibreChat). The implementation plan is in `docs/plans/2026-03-02-dovetail-implementation.md`.

## Monorepo Structure

pnpm workspaces monorepo (Node >=20, pnpm >=9). Commands at the root cascade to all packages.

```
apps/web/       Next.js 15 frontend (App Router, React 19)
apps/api/       Express 5 REST API
packages/types/ Shared TypeScript interfaces — imported by both apps
packages/db/    Drizzle schema, migrations, postgres.js connection
```

## Commands

### Just Commands (preferred dev workflow)

Requires [just](https://github.com/casey/just). These orchestrate Docker, migrations, seeding, and dev servers:

```bash
just setup          # first-time: create .env, install deps, doctor, start DB, migrate, seed
just dev            # daily: start DB + migrate + seed + pnpm dev (hot reload)
just doctor         # check env, Docker, ports, dependencies
just db-reset       # wipe Postgres volume, migrate, and reseed from scratch
just smoke          # read-only smoke test against the running local stack
just smoke-ai       # semantic/RAG smoke test (needs SEED_WITH_EMBEDDINGS=true, SMOKE_AI=1)
just logs-db        # tail Postgres container logs
```

### pnpm Commands (run at repo root)

```bash
pnpm dev                    # start all apps in parallel (hot reload)
pnpm test                   # run all tests across all packages
pnpm build                  # build packages/* then apps/*
pnpm lint                   # lint across all packages
```

### Per-package

```bash
pnpm --filter @dovetail/api dev        # API only (port 3001)
pnpm --filter @dovetail/web dev        # web only (port 3000)
pnpm --filter @dovetail/api test       # API tests only
pnpm --filter @dovetail/api test:watch # watch mode

# Single test file
cd apps/api && pnpm vitest run src/__tests__/health.test.ts
```

### Database

```bash
pnpm --filter @dovetail/db db:generate   # generate migration from schema changes
pnpm --filter @dovetail/db db:migrate    # apply pending migrations
pnpm --filter @dovetail/db db:studio     # open Drizzle Studio (visual DB browser)
```

### Docker

```bash
docker compose up postgres -d   # dev: only Postgres in Docker
docker compose up --build       # production: all services
docker compose ps               # check service health
```

## Architecture

### Request Flow

```
Browser → Next.js (web:3000) → Express API (api:3001) → PostgreSQL
                           ↘ OAuth Provider (Google / Entra)
```

Next.js rewrites all `/api/*` requests to the Express API (`API_URL`, default `http://localhost:3001`). The browser never talks to Express directly — all API calls go through Next.js as a proxy.

In development, only Postgres runs in Docker. Both apps run via `pnpm dev` (or `just dev`) for hot reload.

### Multi-Knowledge-Base Routing

All content API routes are scoped under `/api/knowledge-bases/:kbId/`. The `resolveKb` middleware (`apps/api/src/middleware/resolveKb.ts`) loads the KB and attaches it to `req.kb`. Routes:

- `/api/knowledge-bases/:kbId/articles` — CRUD, publish, bulk operations
- `/api/knowledge-bases/:kbId/categories` — hierarchical category tree
- `/api/knowledge-bases/:kbId/search` — full-text, semantic, hybrid search
- `/api/knowledge-bases/:kbId/tags` — tag management
- `/api/knowledge-bases/:kbId/admin/import` — ZIP/HTML import
- `/api/admin/users`, `/api/admin/api-keys` — global admin (not KB-scoped)
- `POST /api/v1/rag/search` — RAG endpoint (API key auth, KB-aware)

### Auth

Auth.js v5 lives in `apps/web/auth.ts`. It handles the OAuth handshake and issues a JWE stored as an HTTP-only cookie. The Express API decrypts that JWE in `apps/api/src/middleware/auth.ts` using HKDF-derived keys from `NEXTAUTH_SECRET`. `OAUTH_PROVIDER=google|entra` in `.env` switches providers with no code changes.

**Dev auth:** Set `DEV_AUTH_ENABLED=true` (default in `.env.example`) to get three seeded users (admin, editor, viewer) on the `/login` page — bypasses OAuth for local development.

### RBAC

Three roles: `viewer`, `editor`, `admin`. Users have a global role on the `users` table. Two override levels:
- **KB-level:** `user_kb_roles` — role override for an entire knowledge base
- **Category-level:** `user_category_roles` — walks up the ancestor chain via recursive CTE; most specific wins

Middleware chain on protected routes: `authMiddleware` → `resolveKb` → `requireRole(minimumRole)` → handler. KB admin routes additionally use `requireKbAdmin`.

### Database (packages/db)

- Schema defined in `packages/db/src/schema.ts` as Drizzle table definitions
- Connection exported from `packages/db/src/connection.ts` as `db`
- Both apps import `{ db }` and schema from `@dovetail/db`
- `article_versions` is append-only — every article save inserts a new version row, never updates existing ones
- `articles.search_vector` is a `tsvector` column maintained by a Postgres trigger for full-text search
- `article_embeddings.embedding` is a pgvector `vector(1536)` column for semantic search; embeddings are chunked (`chunkIndex`, `chunkText`)
- Migrations auto-run on API container startup in production

### Article Content

Articles store content as Tiptap JSON (a ProseMirror-based rich text format). Conversion utilities live in `apps/api/src/services/import/html-to-tiptap.ts` (HTML → Tiptap) and `apps/api/src/utils/tiptap.ts`.

### Search

Two modes unified under `GET /api/knowledge-bases/:kbId/search`:
- **Full-text:** Postgres `tsvector` + `ts_rank`, filters by category/author/tags/date
- **Semantic:** pgvector cosine similarity on `article_embeddings`
- **Hybrid:** merge and re-rank results from both

Embedding generation is async (does not block the HTTP response). Provider is configurable via `EMBEDDING_PROVIDER=openai|ollama` with a common interface in `apps/api/src/services/embeddings.ts`.

### RAG API

`POST /api/v1/rag/search` uses API key auth (Bearer token, separate from user OAuth). Returns top-K article chunks formatted for LLM consumption. API keys are hashed in the `api_keys` table and can be scoped to specific knowledge bases via `api_key_knowledge_bases`. Admins manage them via the admin UI.

### Shared Types

`packages/types/src/index.ts` exports all shared interfaces (`User`, `Article`, `Category`, `KnowledgeBase`, etc.) and type unions (`Role`, `ArticleStatus`, `OAuthProvider`). Import as `import type { Article } from '@dovetail/types'`. Always define types here, never duplicate them in individual apps.

### Request Validation

API routes use Zod schemas with middleware factories from `apps/api/src/utils/validate.ts` — `validateBody(schema)` and `validateQuery(schema)` — to validate and type-narrow request data before the handler runs.

## Environment Variables

See `.env.example` for the full list. Key ones:

```
DATABASE_URL          postgres connection string
OAUTH_PROVIDER        google | entra
DEV_AUTH_ENABLED      true for local dev (seeded users, no OAuth needed)
NEXTAUTH_SECRET       JWT signing secret (generate with: openssl rand -base64 32)
EMBEDDING_PROVIDER    openai | ollama
EMBEDDING_BASE_URL    set for self-hosted / Ollama
RAG_API_KEY           shared secret for RAG endpoint
API_URL               Express API URL for Next.js rewrites (default: http://localhost:3001)
```

## Testing Conventions

- **Framework:** Vitest + supertest (API), Vitest (packages)
- **Pattern:** TDD — write the failing test first, then implement
- **API tests:** use `supertest(app)` directly (no server needed)
- **DB tests:** run against a real local Postgres (use `DATABASE_URL` pointing to dev DB)
- **Mocking:** use `vi.mock('@dovetail/db', ...)` to mock the db in unit tests for services/middleware
- **Smoke tests:** `just smoke` for quick integration check against a running stack
