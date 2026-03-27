# Multiple Knowledge Bases — Design Spec

## Overview

Add first-class support for multiple knowledge bases (KBs) to Dovetail. Currently the app operates as a single knowledge base with a global category tree. This feature introduces a `knowledge_bases` entity that owns categories, tags, and permissions, enabling separate access control, search scoping, and RAG scoping per KB.

### Goals

- **Access isolation**: Users see all KBs but have different roles per KB
- **Search scoping**: All search modes (fulltext, semantic, hybrid) scope to a single KB
- **RAG scoping**: API keys are associated with specific KBs; RAG queries require a KB context

### Non-goals

- Separate branding/theming per KB
- Cross-KB search (future enhancement)
- Multi-tenancy / organization-level isolation

---

## Data Model

### New tables

#### `knowledge_bases`

| Column        | Type                  | Notes                                 |
|---------------|-----------------------|---------------------------------------|
| `id`          | uuid, PK              |                                       |
| `name`        | text, NOT NULL         | Display name (e.g., "Maryland Housing Law") |
| `slug`        | text, UNIQUE, NOT NULL | URL-safe identifier                   |
| `description` | text, nullable         | Optional summary                      |
| `created_at`  | timestamp              |                                       |

#### `user_kb_roles`

| Column              | Type                          | Notes                          |
|---------------------|-------------------------------|--------------------------------|
| `user_id`           | uuid, FK -> users             |                                |
| `knowledge_base_id` | uuid, FK -> knowledge_bases   |                                |
| `role`              | enum (viewer/editor/admin)    |                                |
| PK                  | (user_id, knowledge_base_id)  |                                |

#### `api_key_knowledge_bases`

| Column              | Type                          | Notes                          |
|---------------------|-------------------------------|--------------------------------|
| `api_key_id`        | uuid, FK -> api_keys          |                                |
| `knowledge_base_id` | uuid, FK -> knowledge_bases   |                                |
| PK                  | (api_key_id, knowledge_base_id) |                              |

### Modified tables

- **`categories`** — add `knowledge_base_id` (uuid, NOT NULL, FK -> knowledge_bases). Unique index changes from `(slug, parent_id)` to `(slug, parent_id, knowledge_base_id)`.
- **`tags`** — add `knowledge_base_id` (uuid, NOT NULL, FK -> knowledge_bases). Unique index changes from `(slug)` to `(slug, knowledge_base_id)`.
- **`import_jobs`** — add `knowledge_base_id` (uuid, NOT NULL, FK -> knowledge_bases).

### Unchanged tables

- **`articles`** — inherit KB through `category_id -> categories.knowledge_base_id`. No direct FK needed.
- **`article_versions`**, **`article_embeddings`**, **`article_tags`**, **`attachments`** — unchanged; scoped transitively through articles.
- **`api_keys`** — base table unchanged; KB scoping handled via `api_key_knowledge_bases` junction table.

---

## RBAC Resolution

### Three-tier permission cascade

```
Global role (users.role)
  -> KB role (user_kb_roles.role)
    -> Category role (user_category_roles.role)
```

Most specific wins, falling back up the chain:

1. Check `user_category_roles` for the target category and its ancestors (existing recursive CTE)
2. If no category-level role found, check `user_kb_roles` for the category's KB
3. If no KB-level role found, fall back to `users.role`

The existing `resolveRole` function extends to `resolveRole(userId, categoryId, knowledgeBaseId, globalRole)`.

### KB-level admin powers

A user with `admin` role at the KB level can:

- Manage users' KB-level and category-level roles within that KB
- Manage API keys scoped to that KB
- Manage tags within that KB
- Run imports into that KB

They **cannot**:

- Create or delete KBs (global admin only)
- Manage other KBs
- Change global user roles

### Global admin behavior

Global admins bypass KB-level checks entirely — full access to all KBs.

---

## Search & RAG Scoping

### Search

All three search modes scope to a single KB via the category's `knowledge_base_id`.

- **Full-text**: Joins through `categories.knowledge_base_id`. Existing filters (categoryId, authorId, tags, date range) continue to work within the KB.
- **Semantic**: Cosine similarity query joins through `articles.category_id -> categories.knowledge_base_id`.
- **Hybrid**: Both legs scoped to the KB before RRF merge/re-rank.

Search always requires a KB context. No cross-KB search in this iteration.

### RAG API

`POST /api/v1/rag/search` changes:

- Request body gains a required `knowledgeBaseId` (or array of IDs)
- API key validated against `api_key_knowledge_bases` — 403 if the key lacks access to requested KB(s)
- Results scoped to requested KB(s)
- Existing `categoryIds` filter works as a narrower scope within the KB(s)

---

## API Routes

### New routes

```
GET    /api/knowledge-bases                         # list all KBs (all authenticated users)
POST   /api/knowledge-bases                         # create KB (global admin only)
GET    /api/knowledge-bases/:id                     # single KB details
PATCH  /api/knowledge-bases/:id                     # update name/description (global or KB admin)
DELETE /api/knowledge-bases/:id                     # delete KB (global admin only, fails if KB has any categories)

GET    /api/knowledge-bases/:id/users               # list users + KB roles (KB admin+)
POST   /api/knowledge-bases/:id/users/:userId       # set user's KB role (KB admin+)
DELETE /api/knowledge-bases/:id/users/:userId       # remove user's KB role (KB admin+)
```

### KB-scoped content routes

All content routes move under `/api/knowledge-bases/:kbId/`:

```
# Categories
GET    /api/knowledge-bases/:kbId/categories
POST   /api/knowledge-bases/:kbId/categories
PATCH  /api/knowledge-bases/:kbId/categories/:id
DELETE /api/knowledge-bases/:kbId/categories/:id

# Articles
GET    /api/knowledge-bases/:kbId/articles
POST   /api/knowledge-bases/:kbId/articles
GET    /api/knowledge-bases/:kbId/articles/:id
PATCH  /api/knowledge-bases/:kbId/articles/:id
DELETE /api/knowledge-bases/:kbId/articles/:id
POST   /api/knowledge-bases/:kbId/articles/:id/publish
GET    /api/knowledge-bases/:kbId/articles/by-path/{*path}

# Versions (nested under articles)
GET    /api/knowledge-bases/:kbId/articles/:id/versions
GET    /api/knowledge-bases/:kbId/articles/:id/versions/:versionId
POST   /api/knowledge-bases/:kbId/articles/:id/versions/:versionId/restore

# Article tags (nested under articles)
GET    /api/knowledge-bases/:kbId/articles/:id/tags
POST   /api/knowledge-bases/:kbId/articles/:id/tags
DELETE /api/knowledge-bases/:kbId/articles/:id/tags/:tagId

# Tags
GET    /api/knowledge-bases/:kbId/tags
POST   /api/knowledge-bases/:kbId/tags
DELETE /api/knowledge-bases/:kbId/tags/:id

# Search
GET    /api/knowledge-bases/:kbId/search?q=...&mode=...

# Import
POST   /api/knowledge-bases/:kbId/admin/import
GET    /api/knowledge-bases/:kbId/admin/import/:jobId
```

### Unchanged routes

- `GET /api/me` — unchanged
- `GET /api/me/effective-role` — gains optional `knowledgeBaseId` query param
- `GET/PATCH /api/admin/users/*` — global user management stays global
- `POST/GET/DELETE /api/admin/api-keys` — API key creation now accepts array of `knowledgeBaseIds`

---

## Frontend Routing

### URL structure

```
/                                           # Dashboard (recent across all KBs, KB switcher)
/kb/:kbSlug                                 # KB home (categories, recent articles)
/kb/:kbSlug/articles/new                    # New article in this KB
/kb/:kbSlug/articles/[...slugPath]          # Article view
/kb/:kbSlug/categories/[...slugPath]        # Category view
/kb/:kbSlug/search                          # Search within KB
/kb/:kbSlug/admin                           # KB admin (KB admin+ only)
/kb/:kbSlug/admin/users                     # KB user/role management
/kb/:kbSlug/admin/tags                      # KB tag management
/kb/:kbSlug/admin/import                    # Import into KB
/admin                                      # Global admin (global admin only)
/admin/users                                # Global user management
/admin/knowledge-bases                      # KB creation/deletion
/admin/api-keys                             # API key management (with KB scoping)
```

### Next.js App Router layout

```
app/
├── layout.tsx                              # Root (providers)
├── login/page.tsx
├── (main)/
│   ├── layout.tsx                          # Auth gate, header
│   ├── page.tsx                            # Dashboard
│   ├── admin/                              # Global admin pages
│   │   ├── knowledge-bases/
│   │   ├── users/
│   │   └── api-keys/
│   └── kb/
│       └── [kbSlug]/
│           ├── layout.tsx                  # KB context provider, sidebar with category tree
│           ├── page.tsx                    # KB home
│           ├── articles/
│           │   ├── new/page.tsx
│           │   └── [...slugPath]/page.tsx
│           ├── categories/
│           │   └── [...slugPath]/page.tsx
│           ├── search/page.tsx
│           └── admin/
│               ├── page.tsx
│               ├── users/page.tsx
│               ├── tags/page.tsx
│               └── import/page.tsx
```

### Navigation

- **Sidebar** — inside a KB, shows that KB's category tree with a KB switcher at the top
- **Dashboard** — recent articles across all accessible KBs, each labeled with its KB name
- **Search** — scoped to current KB when inside one

---

## Migration & Backwards Compatibility

### Data migration steps

1. Create `knowledge_bases`, `user_kb_roles`, `api_key_knowledge_bases` tables
2. Insert a "Default" knowledge base (slug: `default`)
3. Add nullable `knowledge_base_id` columns to `categories`, `tags`, `import_jobs`
4. Backfill all existing rows with the Default KB's ID
5. Add NOT NULL constraints on `knowledge_base_id` columns
6. Backfill `api_key_knowledge_bases` — associate all existing API keys with the Default KB
7. Update unique indexes:
   - `categories(slug, parent_id)` -> `categories(slug, parent_id, knowledge_base_id)`
   - `tags(slug)` -> `tags(slug, knowledge_base_id)`

### Breaking changes

- **API routes**: All content routes move under `/api/knowledge-bases/:kbId/`. No backwards-compatible aliases.
- **RAG endpoint**: Gains required `knowledgeBaseId`. Existing consumers must update requests.
- **Frontend URLs**: All content URLs move under `/kb/:kbSlug/`. Optional redirect middleware can map old paths to `/kb/default/*` during transition.

### Unchanged

- Auth flow (OAuth, JWT)
- Article content format (Tiptap JSON)
- Embedding pipeline (scoped transitively via category's KB)
- Version history
- Attachment storage
