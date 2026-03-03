# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Dovetail is a single-organization legal knowledge base platform. It provides hierarchical wiki-style pages, version history, advanced and semantic search, and a RAG API for LLM integration (e.g. LibreChat). The implementation plan is in `docs/plans/2026-03-02-dovetail-implementation.md`.

## Monorepo Structure

pnpm workspaces monorepo. Commands at the root cascade to all packages.

```
apps/web/       Next.js 15 frontend (App Router, React 19)
apps/api/       Express 5 REST API
packages/types/ Shared TypeScript interfaces — imported by both apps
packages/db/    Drizzle schema, migrations, postgres.js connection
```

## Commands

### Development (run at repo root)

```bash
pnpm dev                    # start all apps in parallel (hot reload)
pnpm test                   # run all tests across all packages
pnpm build                  # build packages/* then apps/*
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
# Run from packages/db with DATABASE_URL set
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

In development, only Postgres runs in Docker. Both apps run via `pnpm dev` for hot reload.

### Auth

Auth.js v5 lives in `apps/web/auth.ts`. It handles the OAuth handshake and issues a JWT stored as an HTTP-only cookie. The Express API validates that JWT in `apps/api/src/middleware/auth.ts` using `jose`. `OAUTH_PROVIDER=google|entra` in `.env` switches providers with no code changes.

### RBAC

Three roles: `viewer`, `editor`, `admin`. Users have a global role on the `users` table. Category-level overrides live in `user_category_roles`. Permission resolution (`apps/api/src/services/permissions.ts`) walks up the category ancestor chain via a recursive CTE — most specific role wins, falls back to global role. Category roles cascade to subcategories.

Middleware chain on protected routes: `authMiddleware` → `requireRole(minimumRole)` → handler.

### Database (packages/db)

- Schema defined in `packages/db/src/schema.ts` as Drizzle table definitions
- Connection exported from `packages/db/src/connection.ts` as `db`
- Both apps import `{ db }` and schema from `@dovetail/db`
- `article_versions` is append-only — every article save inserts a new version row, never updates existing ones
- `articles.search_vector` is a `tsvector` column maintained by a Postgres trigger for full-text search
- `article_embeddings.embedding` is a pgvector `vector(1536)` column for semantic search

### Search

Two modes unified under `GET /api/search`:
- **Full-text:** Postgres `tsvector` + `ts_rank`, filters by category/author/tags/date
- **Semantic:** pgvector cosine similarity on `article_embeddings`
- **Hybrid:** merge and re-rank results from both

Embedding generation is async (does not block the HTTP response). Provider is configurable via `EMBEDDING_PROVIDER=openai|ollama` with a common interface in `apps/api/src/services/embeddings.ts`.

### RAG API

`POST /api/v1/rag/search` uses API key auth (Bearer token, separate from user OAuth). Returns top-K article chunks formatted for LLM consumption. API keys are hashed in the `api_keys` table; admins manage them via the admin UI.

### Shared Types

`packages/types/src/index.ts` exports all shared interfaces (`User`, `Article`, `Category`, etc.) and enums (`Role`, `ArticleStatus`). Import as `import type { Article } from '@dovetail/types'`. Always define types here, never duplicate them in individual apps.

## Environment Variables

See `.env.example` for the full list. Key ones:

```
DATABASE_URL          postgres connection string
OAUTH_PROVIDER        google | entra
NEXTAUTH_SECRET       JWT signing secret (generate with: openssl rand -base64 32)
EMBEDDING_PROVIDER    openai | ollama
EMBEDDING_BASE_URL    set for self-hosted / Ollama
RAG_API_KEY           shared secret for RAG endpoint
```

## Testing Conventions

- **Framework:** Vitest + supertest (API), Vitest (packages)
- **Pattern:** TDD — write the failing test first, then implement
- **API tests:** use `supertest(app)` directly (no server needed)
- **DB tests:** run against a real local Postgres (use `DATABASE_URL` pointing to dev DB)
- **Mocking:** use `vi.mock('@dovetail/db', ...)` to mock the db in unit tests for services/middleware
