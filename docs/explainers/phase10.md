# Phase 10: Polish & Production — What We Built and Why

This document explains what was accomplished in Phase 10 of the Dovetail project, written for a non-technical audience.

## What is Phase 10?

Previous phases built all core features: content management, search, authentication, RBAC, and the RAG API. Phase 10 ties everything together for production: tags for organizing articles, an admin interface for managing users and API keys, and Docker images that package the entire application for deployment on any server.

## What We Built

### 1. Tags API (Task 10.1)

**The problem:** Articles could be categorized, but categories are hierarchical and broad. Sometimes you need a flat, cross-cutting way to label content — for instance, marking several articles across different categories as related to "eviction" or "notice requirements."

**The solution:** Tags. Unlike categories (which are tree-shaped and exclusive — an article belongs to one category), tags are flat and many-to-many — an article can have any number of tags, and a tag can appear on any number of articles.

**Endpoints:**

| Endpoint | Who can use it | What it does |
|----------|---------------|-------------|
| `GET /api/tags` | All logged-in users | List all tags |
| `POST /api/tags` | Editors and admins | Create a new tag |
| `DELETE /api/tags/:id` | Admins only | Remove a tag entirely |
| `POST /api/articles/:id/tags` | Editors and admins | Attach tags to an article |
| `DELETE /api/articles/:id/tags/:tagId` | Editors and admins | Remove a tag from an article |

**Search integration:** The search endpoint (`GET /api/search`) now accepts a `tags` query parameter — a comma-separated list of tag IDs. When provided, only articles with at least one matching tag are returned. This works in fulltext, semantic, and hybrid search modes.

**Slug generation:** Each tag gets an auto-generated URL-friendly slug (e.g., "Landlord-Tenant Law" becomes `landlord-tenant-law`). If a slug collision occurs, a timestamp suffix is appended to make it unique.

### 2. Admin API & UI (Task 10.2)

**The problem:** Admins needed a way to manage users and their roles without direct database access. Phase 9 added API key management endpoints, but there was no admin interface for user management, and no unified admin dashboard.

**The solution:** Four new API endpoints for user administration, plus three admin pages in the web application.

**API endpoints:**

| Endpoint | What it does |
|----------|-------------|
| `GET /api/admin/users` | List all users (paginated) with their roles and providers |
| `PATCH /api/admin/users/:id` | Change a user's global role (viewer, editor, admin) |
| `POST /api/admin/users/:id/category-roles` | Assign a category-specific role to a user |
| `DELETE /api/admin/users/:id/category-roles/:categoryId` | Remove a category-specific role |

All four endpoints require the `admin` role.

**Category role upsert:** When assigning a category role, if the user already has a role for that category, it's updated to the new value rather than creating a duplicate. This is an "upsert" — insert if new, update if existing.

**Admin UI pages:**

- **`/admin`** — Dashboard with links to user management and API key management. Non-admins are redirected to the home page.
- **`/admin/users`** — Table listing all users with their name, email, OAuth provider, and a dropdown to change their global role. Role changes happen immediately via the API.
- **`/admin/api-keys`** — Interface to create new API keys, view all existing keys (name, creation date, last used, status), and revoke active keys. When a key is created, the raw key value is displayed once in a highlighted box — it cannot be retrieved again.

### 3. Production Dockerfiles (Task 10.3)

**The problem:** In development, we run the apps directly with `pnpm dev` for fast hot-reload. For production, we need self-contained Docker images that can be deployed to any server without installing Node.js, pnpm, or any other tooling.

**The solution:** Multi-stage Docker builds for both the API and the web app.

**API Dockerfile (`apps/api/Dockerfile`):**

The build happens in two stages:
1. **Builder stage:** Installs all dependencies, compiles TypeScript to JavaScript, and builds all packages
2. **Runner stage:** Copies only the compiled output and production dependencies — no source code, no dev tooling

On startup, the API container runs database migrations automatically before starting the server. This means deploying a new version will apply any schema changes without manual intervention.

**Web Dockerfile (`apps/web/Dockerfile`):**

Next.js has a `standalone` output mode that produces a self-contained Node.js server. The Dockerfile:
1. Builds the entire Next.js application (including server-side rendering, static pages, etc.)
2. Copies only the standalone output — a minimal server that doesn't need Next.js or pnpm installed

**Migration script (`packages/db/src/migrate.ts`):**

A standalone script that runs Drizzle migrations against the database. Called automatically by the API container on startup, ensuring the database schema is always up to date.

**Docker Compose updates:**

The `docker-compose.yml` now passes all required environment variables to the API and web containers:
- OAuth configuration (provider, client ID, secrets)
- Authentication secrets
- Embedding provider configuration
- Database connection strings

This means `docker compose up --build` starts the entire stack — database, API, and web app — with a single command.

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `apps/api/src/routes/tags.ts` | Tag CRUD and article-tag association endpoints |
| `apps/api/src/__tests__/routes/tags.test.ts` | Tests for tag routes (12 tests) |
| `apps/api/src/routes/admin/users.ts` | Admin user management endpoints |
| `apps/api/src/__tests__/routes/admin/users.test.ts` | Tests for admin user routes (10 tests) |
| `apps/web/app/(main)/admin/page.tsx` | Admin dashboard page |
| `apps/web/app/(main)/admin/users/page.tsx` | User management page (server component) |
| `apps/web/app/(main)/admin/users/UserList.tsx` | User list with role editing (client component) |
| `apps/web/app/(main)/admin/api-keys/page.tsx` | API key management page (server component) |
| `apps/web/app/(main)/admin/api-keys/ApiKeyManager.tsx` | API key create/revoke interface (client component) |
| `apps/api/Dockerfile` | Multi-stage production build for the API |
| `apps/web/Dockerfile` | Multi-stage production build for the web app |
| `packages/db/src/migrate.ts` | Standalone migration runner for Docker startup |

### Modified files
| File | Change |
|------|--------|
| `apps/api/src/app.ts` | Mounted tags, article-tags, and admin users routers |
| `apps/api/src/routes/search.ts` | Added `tags` query param for tag-based filtering |
| `apps/api/src/__tests__/helpers/db-mock.ts` | Added `onConflictDoNothing` to mock chain |
| `apps/web/next.config.ts` | Added `output: 'standalone'` for Docker builds |
| `docker-compose.yml` | Added environment variables for API and web containers |
| `.env.example` | Updated embedding key variable name |

## How It All Connects

```
Admin Dashboard (/admin)
    ├── User Management (/admin/users)
    │       → GET /api/admin/users (list)
    │       → PATCH /api/admin/users/:id (change role)
    │       → POST/DELETE category roles
    │
    └── API Key Management (/admin/api-keys)
            → POST /api/admin/api-keys (create)
            → GET /api/admin/api-keys (list)
            → DELETE /api/admin/api-keys/:id (revoke)

Tag System:
    Editor creates tag → POST /api/tags
    Editor tags article → POST /api/articles/:id/tags
    User searches with tag filter → GET /api/search?tags=uuid1,uuid2

Production Deployment:
    docker compose up --build
        → Postgres container (pgvector)
        → API container (runs migrations, then starts Express)
        → Web container (standalone Next.js server)
```

## Smoke Test Checklist

After running `docker compose up --build`, verify:
- [ ] Login redirects to OAuth provider
- [ ] After login, home page loads
- [ ] Create a category (as admin)
- [ ] Create and publish an article (as editor)
- [ ] Search returns the article
- [ ] RAG endpoint returns chunks for a query
- [ ] Viewer cannot access edit UI
- [ ] Tags can be created and assigned to articles

## What's Next

Dovetail is now feature-complete per the implementation plan. Future enhancements could include:
- Rich text improvements (tables, images, embeds)
- Email notifications for content changes
- Audit logging for compliance
- Multi-language support
- Analytics dashboard
