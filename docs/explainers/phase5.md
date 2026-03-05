# Phase 5: Core API — Articles & Categories — What We Built and Why

This document explains what was accomplished in Phase 5 of the Dovetail project, written for a non-technical audience.

## What is Phase 5?

Phase 5 is where the knowledge base becomes functional. Before this phase, Dovetail had authentication, permissions, and a database — but no way to actually create or manage content. After Phase 5, users can create categories, write articles, edit them with full version history, and browse the knowledge base through a complete REST API.

## What We Built

### 1. Category Management (`apps/api/src/routes/categories.ts`)

Categories are the organisational structure of the knowledge base — think of them like folders. They can be nested (e.g., "Housing Law" > "Tenant Rights" > "Eviction Defence").

**Endpoints:**
- **List all categories** — Returns a flat list that the frontend assembles into a tree using each category's `parentId`. Available to all authenticated users.
- **Create a category** — Requires editor role. Automatically generates a URL-friendly slug from the name.
- **Update a category** — Requires editor role. Can rename or move a category to a different parent.
- **Delete a category** — Requires admin role. Refuses to delete categories that still contain subcategories or articles (returns a 409 Conflict error), preventing accidental data loss.

**Slug collision handling:** If two categories end up with the same slug (e.g., two categories both named "General"), the system automatically appends a unique suffix to the second one.

**Why this matters:** Categories let organisations structure their knowledge base in whatever hierarchy makes sense for them, while the deletion safeguards prevent accidentally orphaning content.

### 2. Article Management (`apps/api/src/routes/articles.ts`)

Articles are the core content of the knowledge base. Each article belongs to a category and has a status lifecycle: draft → published → archived.

**Endpoints:**
- **List articles** — Paginated, with optional filters by status and category. Returns a consistent `{ data, total, page, limit }` envelope.
- **Get article by ID** — Direct lookup for when the frontend knows the article's UUID.
- **Get article by slug** — Lookup by URL-friendly slug, enabling clean URLs like `/articles/tenant-rights-overview`.
- **Create article** — Requires editor role. Creates a new draft with the author set to the current user.
- **Update article** — Requires editor role in the article's category (uses per-category RBAC). Every update automatically creates a version snapshot of the previous content before applying changes.
- **Archive article** — Soft delete: sets status to "archived" instead of physically deleting the row. The article can be recovered later.
- **Publish article** — Sets status to "published" and records the publication timestamp.

**Per-category RBAC on updates:** When editing an article, the system doesn't just check the user's global role — it resolves their effective role for the article's specific category using the permission resolution from Phase 4. A user who is an editor in "Housing Law" can edit articles there, even if they're only a viewer globally.

**Why this matters:** The article lifecycle (draft → published → archived) lets editors prepare content before making it visible, and soft-delete means nothing is ever accidentally lost.

### 3. Version History (`apps/api/src/routes/versions.ts`)

Every time an article is edited, the system saves a snapshot of the previous content as a **version**. This creates an audit trail and enables rollback.

**Endpoints:**
- **List versions** — Paginated list of all versions for an article, ordered by most recent first.
- **Get specific version** — View the full content of any historical version.
- **Restore a version** — Requires editor role. Takes an old version's content and makes it the current article content. The current content is saved as a new version first, so nothing is ever lost.

**Transaction safety:** Both updates and restores use **database transactions** — a mechanism that ensures either all changes succeed together or none of them do. This prevents a crash mid-save from leaving the article in an inconsistent state (e.g., version row created but article not updated).

**Version numbering:** Version numbers are computed inside the transaction by finding the current maximum and adding one. This prevents race conditions where two simultaneous edits could produce duplicate version numbers.

**Why this matters:** Version history is critical for a legal knowledge base. Lawyers need to see what changed, when, and by whom. The restore feature means any accidental edit can be undone instantly.

### 4. Supporting Infrastructure Changes

- **Express 5 compatibility:** Fixed the query validation middleware to work with Express 5's read-only `req.query` property by storing parsed query data in `res.locals.query`.
- **Route ordering:** The `by-slug/:slug` route is defined before `/:id` to prevent Express from matching "by-slug" as an ID parameter.
- **DATABASE_URL in test config:** Added a mock database URL to the Vitest configuration so that tests using `vi.mock('@dovetail/db')` can load the original module's schema exports without requiring a real database connection.

### 5. Automated Tests

We wrote 30 tests covering:
- **Category routes (11 tests):** Auth requirement, CRUD operations, role enforcement (viewer blocked from creating, non-admin blocked from deleting), deletion safeguards (409 when children or articles exist).
- **Article routes (13 tests):** Auth, paginated listing, lookup by ID and slug, creation, update with versioning, per-category RBAC, archival, publishing, 404 handling.
- **Version routes (6 tests):** Paginated version listing, specific version lookup, restoration with transaction, role enforcement, 404 handling.

All tests use mocked database calls with a shared chain-mock helper, allowing them to run instantly without a database.

## What's Next

Phase 6 builds the Next.js frontend that consumes these APIs — a browsable interface for viewing categories, reading articles, and (for editors) creating and editing content.
