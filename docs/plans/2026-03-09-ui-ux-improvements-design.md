# Dovetail UI/UX Improvements — Design Document

**Date**: 2026-03-09
**Status**: Approved for implementation
**Scope**: Comprehensive frontend UI/UX improvements across 7 phases

---

## Problem Statement

Dovetail's Express 5 API has comprehensive CRUD, search, tagging, and RBAC capabilities, but the Next.js 15 frontend exposes only a fraction of them. Users cannot perform basic content management tasks through the UI. Key gaps include:

- **No article creation UI** — `POST /api/articles` exists but there is no "New Article" button or page
- **No category management** — `POST/PATCH/DELETE /api/categories` all exist but have no frontend
- **No admin navigation** — the `/admin` section exists but there is no link to reach it
- **No tag system in UI** — full CRUD API exists (`/api/tags`, `/api/articles/:id/tags`), zero frontend
- **No search filters** — API supports mode (fulltext/semantic/hybrid), author, date range, and tags, but the UI only sends a query string
- **Empty landing page** — shows only "Welcome to Dovetail" and "Signed in as {name}"
- **No sign-out button** anywhere in the app
- **No user profile/avatar** display

The primary users are legal staff (lawyers, paralegals, support staff) with varying technical comfort, making discoverability and clear affordances critical.

---

## Design Decisions

- **Visual direction**: Refined Editorial — keep the existing warm brown/parchment identity (Playfair Display headings, Source Serif body, DM Sans UI, `#8b4513` accent, `#faf8f5` parchment backgrounds). Modernize layout and interaction patterns without changing the palette. The design is appropriate for a legal knowledge base; the problems are structural, not aesthetic.
- **Implementation approach**: Infrastructure first — build reusable UI components and RBAC helpers in Phase 1, then all subsequent phases use a consistent foundation.
- **Phase sizing**: Medium (3-6 tasks per phase), 7 phases total.
- **API changes**: Only one new endpoint needed across all phases — `GET /api/admin/users/:id/category-roles` in Phase 6. Everything else is already built.

---

## Current Frontend Architecture

### File Structure (apps/web/)

| Path | Purpose |
|------|---------|
| `app/(main)/layout.tsx` | Main layout — sidebar (280px) + header with SearchBar + content area |
| `app/(main)/page.tsx` | Landing page — currently near-empty |
| `app/(main)/articles/[slug]/page.tsx` | Article viewer — hero header, Edit button (editor+), ArticleContent |
| `app/(main)/articles/[slug]/edit/page.tsx` | Article editor — Tiptap rich text, Save/Publish/Cancel |
| `app/(main)/articles/[slug]/history/page.tsx` | Version history — list with restore buttons |
| `app/(main)/categories/[slug]/page.tsx` | Category listing — article list with status badges |
| `app/(main)/search/page.tsx` | Search results — paginated, no filters |
| `app/(main)/admin/page.tsx` | Admin dashboard — cards linking to Users and API Keys |
| `app/(main)/admin/users/page.tsx` | User management — table with inline role dropdowns |
| `app/(main)/admin/api-keys/page.tsx` | API key management — create/revoke |
| `app/login/page.tsx` | OAuth login — provider-aware single sign-in button |
| `components/Sidebar.tsx` | Sidebar — dark brown, fetches categories server-side |
| `components/SidebarTree.tsx` | Hierarchical category tree — expand/collapse, `buildTree()` utility |
| `components/SearchBar.tsx` | Search form — text input in header |
| `components/ArticleEditor.tsx` | Rich text editor — Tiptap with StarterKit, draft/publish |
| `components/ArticleContent.tsx` | Read-only article renderer — Tiptap in read-only mode |
| `components/RestoreButton.tsx` | Two-step restore confirmation |
| `lib/api.ts` | Server-side API fetch (with auth token forwarding) |
| `lib/api-client.ts` | Client-side API fetch (with credentials) |

### Current RBAC Pattern in Frontend

- Three roles: `viewer` < `editor` < `admin` (from `@dovetail/types`)
- Server components: `const session = await auth()` then check `session?.user?.role`
- Client components: `useSession()` from `next-auth/react`
- Current inline pattern (repeated in 3+ places):
  ```tsx
  const userRole = session?.user?.role ?? 'viewer';
  const canEdit = userRole === 'editor' || userRole === 'admin';
  {canEdit && <EditButton />}
  ```

### Styling

- **Tailwind CSS v4** with custom theme variables
- Color tokens: `ink`, `parchment`, `accent`, `border-light`, `sidebar-*`, status colors
- Fonts: Playfair Display (display), Source Serif 4 (body), DM Sans (ui), JetBrains Mono (code)
- No component library — all styles are inline Tailwind classes, repeated across components
- No icon library — SVGs inlined per component

---

## Backend API Capabilities (for reference)

All of these endpoints exist and are functional. The frontend work is purely about building UI for them.

### Articles
- `GET /api/articles` — list, paginated, filter by `status`, `categoryId`
- `GET /api/articles/by-slug/:slug` — fetch by slug
- `GET /api/articles/:id` — fetch by ID
- `POST /api/articles` — create draft (editor+), auto-generates slug, triggers async embedding
- `PATCH /api/articles/:id` — update (editor+), creates version snapshot, category-level RBAC check
- `DELETE /api/articles/:id` — archive/soft-delete (editor+), sets status to `archived`
- `POST /api/articles/:id/publish` — publish draft (editor+)

### Article Versions
- `GET /api/articles/:id/versions` — list versions, paginated
- `GET /api/articles/:id/versions/:versionId` — fetch specific version
- `POST /api/articles/:id/versions/:versionId/restore` — restore (editor+), creates snapshot first

### Categories
- `GET /api/categories` — list all categories
- `POST /api/categories` — create (editor+)
- `PATCH /api/categories/:id` — update name/parent (editor+)
- `DELETE /api/categories/:id` — delete (admin only), validates no children/articles exist

### Tags
- `GET /api/tags` — list all tags
- `POST /api/tags` — create (editor+)
- `DELETE /api/tags/:id` — delete (admin only)
- `POST /api/articles/:id/tags` — assign tags (editor+), accepts `{ tagIds: [] }`
- `DELETE /api/articles/:id/tags/:tagId` — remove tag (editor+)

### Search
- `GET /api/search` — unified search
  - `q` (required), `mode` (fulltext|semantic|hybrid), `categoryId`, `authorId`, `from`/`to` date range, `tags` (comma-separated IDs), `page`, `limit`
  - Fulltext: Postgres `websearch_to_tsquery` + `ts_rank`
  - Semantic: pgvector cosine similarity (1536-dim embeddings)
  - Hybrid: Reciprocal Rank Fusion merge of both

### Admin
- `GET /api/admin/users` — list users (admin)
- `PATCH /api/admin/users/:id` — update global role (admin)
- `POST /api/admin/users/:id/category-roles` — assign category role override (admin)
- `DELETE /api/admin/users/:id/category-roles/:categoryId` — remove override (admin)
- `POST /api/admin/api-keys` — create API key (admin)
- `GET /api/admin/api-keys` — list keys (admin)
- `DELETE /api/admin/api-keys/:id` — revoke key (admin)

### Other
- `GET /api/me` — current user info
- `POST /api/v1/rag/search` — RAG endpoint (API key auth, not OAuth)
- `GET /health` — health check

### RBAC Middleware Stack
1. `authMiddleware` — validates JWT (from Auth.js session cookie or Bearer token), adds `req.user = { id, role }`
2. `requireRole(minimumRole)` — coarse-grained global role check (viewer < editor < admin)
3. `resolveRole(userId, categoryId, globalRole)` — category-level RBAC via recursive CTE walking ancestor chain; most-specific role wins

---

## Implementation Plan

### Phase Dependency Graph

```
Phase 1: UI Foundation
   │
   v
Phase 2: Navigation & Landing
   │
   v
Phase 3: Content Management  ← highest user impact
   │
   ├──> Phase 4: Search & Discovery  ─┐
   │                                   │ (can run in parallel)
   ├──> Phase 5: Tag System  ─────────┘
   │
   v
Phase 6: Admin Enhancements
   │
   v
Phase 7: Polish & Accessibility
```

Phases 4 and 5 can run in parallel after Phase 3. Phase 6 needs only Phase 3. Phase 7 is last (touches components from all phases).

---

### Phase 1: UI Foundation & Component Library

**Goal**: Establish reusable primitives and RBAC-aware building blocks so all subsequent phases have consistent components.

#### Tasks

1. **Install Lucide React** — tree-shakeable icon library to replace inline SVGs throughout the app
   - Modify: `apps/web/package.json`

2. **Create shared UI components** in `apps/web/components/ui/`:
   - `Button.tsx` — variants: primary (accent bg), secondary (outline), ghost (text-only), danger; sizes: sm, md. Currently 8+ inline button styles across the codebase.
   - `Badge.tsx` — refactor the inline `StatusBadge` from `categories/[slug]/page.tsx` into a reusable component. Variants: published (green), draft (amber), archived (gray), plus custom color.
   - `Modal.tsx` — dialog/confirmation using HTML `<dialog>` element (no extra dependency). Needed for: category CRUD (Phase 3), article deletion (Phase 3), tag management (Phase 5).
   - `DropdownMenu.tsx` — trigger + popover pattern for action menus. Needed for: article actions (Phase 3), user menu (Phase 2).
   - `Card.tsx` — bordered container replacing repeated `bg-parchment-warm border border-border-light rounded-lg` pattern.
   - `index.ts` — barrel export

3. **Create `RoleGate` component** at `apps/web/components/RoleGate.tsx`
   - Props: `minimumRole: 'viewer' | 'editor' | 'admin'`, renders `children` only if user meets threshold
   - Server variant: uses `auth()` from `apps/web/auth.ts`
   - Client variant (`RoleGateClient`): uses `useSession()` from `next-auth/react`, needs `'use client'` directive
   - Replaces the scattered inline `const canEdit = userRole === 'editor' || userRole === 'admin'` pattern

4. **Create `apps/web/lib/roles.ts`**
   - `hasMinimumRole(userRole: Role, requiredRole: Role): boolean` — mirrors the API's `hasMinimumRole()` in `apps/api/src/services/permissions.ts`
   - Role hierarchy: `{ viewer: 0, editor: 1, admin: 2 }`

5. **Create `useCurrentUser` hook** at `apps/web/lib/hooks/useCurrentUser.ts`
   - Wraps `useSession()` and returns typed user data (`{ id, name, email, image, role }`)
   - Provides `isEditor`, `isAdmin` convenience booleans

#### Files
- **Create**: `apps/web/components/ui/Button.tsx`, `Badge.tsx`, `Modal.tsx`, `DropdownMenu.tsx`, `Card.tsx`, `index.ts`; `apps/web/components/RoleGate.tsx`; `apps/web/lib/roles.ts`; `apps/web/lib/hooks/useCurrentUser.ts`
- **Modify**: `apps/web/package.json`

#### Dependencies: None

---

### Phase 2: Navigation, Chrome & Landing Page

**Goal**: Make the app navigable. Fix the three biggest UX gaps: useless landing page, hidden admin section, lack of user context.

#### Tasks

1. **Add user profile section to sidebar bottom** (`apps/web/components/Sidebar.tsx`)
   - Display user avatar (from `session.user.image`), name, and role badge (using `Badge` from Phase 1)
   - "Sign out" button (currently NO sign-out exists anywhere in the app) — calls `signOut()` from `next-auth/react`
   - For admin users: gear icon linking to `/admin` (wrapped in `RoleGate minimumRole="admin"`)
   - Implementation: `Sidebar.tsx` already calls `apiFetch` server-side for categories; add `auth()` call alongside it

2. **Create breadcrumbs component** at `apps/web/components/Breadcrumbs.tsx`
   - Props: array of `{ label: string, href?: string }` segments
   - Use on: article pages (Category > Article Title), category pages (Parent > Category), admin pages (Admin > Users), edit pages (Category > Article > Editing)
   - Replace manual breadcrumb in `apps/web/app/(main)/articles/[slug]/history/page.tsx` (lines 40-47)

3. **Redesign landing page** (`apps/web/app/(main)/page.tsx`)
   - "Quick actions" row: "New Article" button (editor+, links to `/articles/new` from Phase 3), "Search" button
   - "Recently updated articles" section: `GET /api/articles?limit=10` sorted by updatedAt
   - "Your drafts" section (editor+ only): `GET /api/articles?status=draft&limit=5` filtered by current user
   - Keep lean — two or three sections maximum

4. **Enhance the header** (`apps/web/app/(main)/layout.tsx`)
   - Add breadcrumbs on the left side
   - Keep SearchBar on the right
   - Add "New Article" button (editor+, visible globally) — this is the highest-priority missing feature in the current UI

5. **Add collapsible sidebar toggle**
   - Hamburger/chevron button at top of sidebar
   - Store collapsed state in `localStorage` via a small client wrapper
   - When collapsed, show only icons (or hide completely on mobile)

#### RBAC
- "New Article" button: `RoleGate minimumRole="editor"`
- Admin link in sidebar: `RoleGate minimumRole="admin"`
- "Your drafts" section on landing: editor+ only

#### Files
- **Create**: `apps/web/components/Breadcrumbs.tsx`, `apps/web/components/UserMenu.tsx`
- **Modify**: `apps/web/components/Sidebar.tsx`, `apps/web/app/(main)/layout.tsx`, `apps/web/app/(main)/page.tsx`

#### Dependencies: Phase 1 (Button, Badge, RoleGate, Card)

---

### Phase 3: Content Management (Article & Category CRUD)

**Goal**: Enable editors and admins to create, archive, and manage articles and categories through the UI. This is the most critical functional gap — the app currently has no way to create content through the frontend.

#### Tasks

1. **Create "New Article" page** at `apps/web/app/(main)/articles/new/page.tsx`
   - Server component that checks for editor+ role (redirect viewers to `/`, same pattern as `edit/page.tsx` lines 16-18)
   - Renders `ArticleCreateForm` client component

2. **Create `ArticleCreateForm` component** at `apps/web/components/ArticleCreateForm.tsx`
   - Title input (same styling as `ArticleEditor.tsx`)
   - Category selector dropdown: fetch categories from `/api/categories`, display hierarchically (indented by depth, reuse the `buildTree()` function from `SidebarTree.tsx`)
   - Tiptap editor for content (reuse same StarterKit config as `ArticleEditor.tsx`)
   - "Save as Draft" and "Publish" buttons
   - Calls `POST /api/articles` with `{ title, categoryId, content }`
   - On success: redirect to `/articles/{slug}` (slug is returned in the API response)
   - Accept optional `?categoryId` query param to pre-select category (for CTA from category pages)

3. **Add article action menu** to `apps/web/app/(main)/articles/[slug]/page.tsx`
   - Currently only an "Edit" link button exists. Replace with:
     - Primary "Edit" button (editor+) — existing functionality, keep prominent
     - "..." overflow dropdown (using `DropdownMenu` from Phase 1) containing:
       - "Move to category..." (editor+) — opens modal with hierarchical category selector, calls `PATCH /api/articles/:id` with new `categoryId`
       - "Archive" (editor+) — opens confirmation modal ("Are you sure? This will archive the article."), calls `DELETE /api/articles/:id`
   - Create as `apps/web/components/ArticleActions.tsx` client component

4. **Add category management to sidebar** (`apps/web/components/SidebarTree.tsx` and `Sidebar.tsx`)
   - "+" icon button next to "Categories" heading (editor+) → opens `CategoryModal` for creating a new root category
   - On hover/focus of each category node (admin only): "..." icon → context menu with "Rename" and "Delete" options
   - "Delete" validates server-side (API returns error if category has children or articles)
   - Calls `POST /api/categories`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id`
   - After mutation: call `router.refresh()` to re-render the server component and refresh the tree

5. **Create `CategoryModal` component** at `apps/web/components/CategoryModal.tsx`
   - Props: optional `category` (for editing vs creating), optional `parentId` (for creating subcategory)
   - Name input field
   - Optional parent selector dropdown (hierarchical, same `buildTree()` logic)
   - Submit calls `POST /api/categories` (create) or `PATCH /api/categories/:id` (rename)
   - On success: triggers `router.refresh()` and closes modal

6. **Add empty-state CTA to category pages** (`apps/web/app/(main)/categories/[slug]/page.tsx`)
   - When category has zero articles and user is editor+: show a prominent "Create the first article in this category" button
   - Links to `/articles/new?categoryId={id}`
   - When category has articles: show existing list (no change)

#### RBAC
- Article create/edit/archive: editor+ (matches `requireRole('editor')` on API)
- Category create/rename: editor+ (matches API)
- Category delete: admin only (matches `requireRole('admin')` on `DELETE /api/categories/:id`)
- All action buttons must be wrapped in appropriate `RoleGate`

#### Files
- **Create**: `apps/web/app/(main)/articles/new/page.tsx`, `apps/web/components/ArticleCreateForm.tsx`, `apps/web/components/CategoryModal.tsx`, `apps/web/components/ArticleActions.tsx`
- **Modify**: `apps/web/app/(main)/articles/[slug]/page.tsx`, `apps/web/app/(main)/categories/[slug]/page.tsx`, `apps/web/components/SidebarTree.tsx`, `apps/web/components/Sidebar.tsx`

#### Dependencies: Phase 1 (Button, Modal, DropdownMenu, RoleGate), Phase 2 (header "New Article" button links to the page created here)

---

### Phase 4: Search & Discovery

**Goal**: Expose the full search capabilities that the API already supports but the frontend does not surface.

#### Tasks

1. **Create search filter panel** at `apps/web/components/SearchFilters.tsx`
   - Client component rendering collapsible filter controls
   - **Search mode toggle**: three-way segmented control for fulltext / "AI-powered" (semantic) / hybrid. Default to fulltext. Label "semantic" as "AI-powered" for non-technical users.
   - **Category filter**: dropdown populated from `GET /api/categories`, hierarchical display using `buildTree()` logic
   - **Date range**: two date inputs (from/to) with preset buttons ("Last 7 days", "Last 30 days", "Last year")
   - **Tags filter**: multi-select from `GET /api/tags` (functional immediately if tags exist in DB, richer after Phase 5)
   - All filters update URL search params (`?mode=semantic&categoryId=...&from=...`) so results are shareable/bookmarkable
   - "Clear filters" button to reset all

2. **Redesign search results page** (`apps/web/app/(main)/search/page.tsx`)
   - Add `SearchFilters` panel above results (collapsible) or as a left sidebar
   - Result cards: article title, category name (requires category lookup — fetch categories and build a map by ID), update date, snippet/excerpt
   - Search mode indicator: "Showing AI-powered results" / "Showing full-text results" / "Showing hybrid results"
   - Relevance indicators: the API returns `rank` for fulltext and `similarity` for semantic — display as subtle bar or score
   - Improve empty state: "No results found. Try broadening your search or using AI-powered mode."
   - Keep existing pagination

3. **Enhance SearchBar** (`apps/web/components/SearchBar.tsx`)
   - Add keyboard shortcut hint in the input placeholder: "Search... (Cmd+K)"
   - Add global keyboard listener for Cmd+K / Ctrl+K that focuses the search input
   - Register the listener in `apps/web/app/(main)/layout.tsx`

4. **Add category-scoped search** to category pages (`apps/web/app/(main)/categories/[slug]/page.tsx`)
   - Add a search input at the top of the article list
   - Submitting navigates to `/search?q={query}&categoryId={categoryId}`
   - Pre-filters results to that category

#### RBAC
- Search is available to all authenticated roles
- The API already filters to `status = 'published'` articles only, so viewers cannot see drafts through search

#### Files
- **Create**: `apps/web/components/SearchFilters.tsx`
- **Modify**: `apps/web/app/(main)/search/page.tsx`, `apps/web/components/SearchBar.tsx`, `apps/web/app/(main)/categories/[slug]/page.tsx`, `apps/web/app/(main)/layout.tsx`

#### Dependencies: Phase 1 (Button, Badge, Card)

---

### Phase 5: Tag System

**Goal**: Build complete tag management and article tagging UI. The backend has full CRUD support for tags, but there is zero frontend implementation.

#### Tasks

1. **Create tag management page** at `apps/web/app/(main)/admin/tags/page.tsx`
   - Admin-only (same `auth()` + redirect pattern as other admin pages)
   - List all tags
   - "Create tag" form at top: name input + submit button (editor+ can create, matching API's `requireRole('editor')` on `POST /api/tags`)
   - Delete button per tag (admin only, matching API's `requireRole('admin')` on `DELETE /api/tags/:id`)
   - Calls `GET /api/tags`, `POST /api/tags`, `DELETE /api/tags/:id`

2. **Create `TagList` client component** at `apps/web/app/(main)/admin/tags/TagList.tsx`
   - Interactive list managing tag CRUD with optimistic updates
   - Follow the same pattern as `apps/web/app/(main)/admin/api-keys/ApiKeyManager.tsx` (state-managed list, `apiClientFetch` calls)

3. **Add tag assignment to article editor** (`apps/web/components/ArticleEditor.tsx` and `apps/web/components/ArticleCreateForm.tsx`)
   - Below the title input, add a "Tags" section
   - Multi-select tag picker (`TagPicker` component) that fetches available tags from `GET /api/tags`
   - Currently assigned tags shown as removable chips/badges
   - On add: `POST /api/articles/:id/tags` with `{ tagIds: [id] }`
   - On remove: `DELETE /api/articles/:id/tags/:tagId`
   - For `ArticleCreateForm`: tags are assigned after initial save (save article first to get ID, then assign tags)

4. **Display tags on article view** (`apps/web/app/(main)/articles/[slug]/page.tsx`)
   - Show assigned tags as clickable `Badge` components below the article title/metadata area
   - Clicking a tag navigates to `/search?tags={tagId}` to find related articles

5. **Add "Tags" card to admin dashboard** (`apps/web/app/(main)/admin/page.tsx`)
   - Third card alongside existing "Users" and "API Keys" cards
   - Links to `/admin/tags`
   - Same card styling as existing admin dashboard cards

#### RBAC
- Tag creation: editor+ (matches API)
- Tag deletion: admin only (matches API)
- Tag assignment on articles: editor+ (matches API)
- Tag viewing (on article pages, in search filters): all roles

#### Files
- **Create**: `apps/web/app/(main)/admin/tags/page.tsx`, `apps/web/app/(main)/admin/tags/TagList.tsx`, `apps/web/components/TagPicker.tsx`
- **Modify**: `apps/web/components/ArticleEditor.tsx`, `apps/web/components/ArticleCreateForm.tsx`, `apps/web/app/(main)/articles/[slug]/page.tsx`, `apps/web/app/(main)/admin/page.tsx`, `apps/web/components/SearchFilters.tsx` (enable tag filter that was a placeholder)

#### Dependencies: Phase 1 (Badge, Button, Modal), Phase 3 (ArticleCreateForm exists), Phase 4 (SearchFilters has tag filter placeholder)

---

### Phase 6: Admin Enhancements (Category-Level RBAC)

**Goal**: Expose the category-level role override system through the admin UI. The backend fully supports assigning per-category role overrides (e.g., giving a viewer editor access to a specific category), but there is no frontend for managing this.

#### Tasks

1. **Create user detail page** at `apps/web/app/(main)/admin/users/[id]/page.tsx`
   - Admin-only page (same auth pattern)
   - User info section: name, email, avatar, provider (Google/Entra), global role
   - Category role overrides table: columns for Category Name, Role, Actions (Remove)
   - "Add category role" form: category dropdown (hierarchical) + role dropdown (viewer/editor/admin) + "Assign" button
   - Remove button on each override row
   - Calls `GET /api/admin/users/:id/category-roles` (new endpoint, see task 3), `POST /api/admin/users/:id/category-roles`, `DELETE /api/admin/users/:id/category-roles/:categoryId`

2. **Create `CategoryRoleManager` client component** at `apps/web/app/(main)/admin/users/[id]/CategoryRoleManager.tsx`
   - Interactive component managing the category role override list
   - Fetches categories from `GET /api/categories` for the dropdown
   - Fetches existing overrides from the new endpoint
   - Optimistic updates for add/remove operations

3. **Add API endpoint** `GET /api/admin/users/:id/category-roles`
   - In `apps/api/src/routes/admin/users.ts`
   - Returns the user's category role overrides joined with category names
   - Protected by `requireRole('admin')`
   - ~20 lines of code: query `user_category_roles` table joined with `categories`, filter by `userId`
   - Response shape: `{ categoryRoles: [{ categoryId, categoryName, role }] }`

4. **Make user table rows clickable** in `apps/web/app/(main)/admin/users/UserList.tsx`
   - Each row becomes a link to `/admin/users/{id}`
   - Keep the inline role dropdown on the table for quick global role changes (don't force navigation for simple role changes)

5. **Add summary stats to admin dashboard** (`apps/web/app/(main)/admin/page.tsx`)
   - Total users by role (viewers/editors/admins)
   - Total articles (published/draft/archived)
   - Total categories
   - Total tags
   - Fetch from existing list endpoints or add lightweight count endpoints

#### RBAC: All pages in this phase require admin role.

#### Files
- **Create**: `apps/web/app/(main)/admin/users/[id]/page.tsx`, `apps/web/app/(main)/admin/users/[id]/CategoryRoleManager.tsx`
- **Modify**: `apps/web/app/(main)/admin/users/UserList.tsx`, `apps/web/app/(main)/admin/page.tsx`, `apps/api/src/routes/admin/users.ts` (new endpoint)

#### Dependencies: Phase 1 (Button, Badge, Card, Modal), Phase 3 (category data fetching patterns established)

---

### Phase 7: Polish & Accessibility

**Goal**: Cross-cutting quality improvements that make the app feel finished and accessible to users of all technical comfort levels.

#### Tasks

1. **Add toast notification system**
   - Create `apps/web/components/ui/Toast.tsx`, `ToastProvider.tsx`, and `apps/web/lib/hooks/useToast.ts`
   - Replace scattered inline status messages ("Saved", "Save failed", "Published") with consistent toast notifications
   - Wrap app in `ToastProvider` in `apps/web/app/providers.tsx` (or layout)
   - Update all interactive components to use `useToast()`: ArticleEditor, ArticleCreateForm, RestoreButton, UserList, ApiKeyManager, CategoryRoleManager, TagList

2. **Standardize confirmation dialogs for destructive actions**
   - Currently only `RestoreButton` has a two-step confirmation (inline "Sure? Yes/No" pattern)
   - Replace with consistent Modal-based confirmation for: article archiving, category deletion, API key revocation, category role removal
   - Consistent pattern: "Are you sure you want to [action]? This [consequence]." with Cancel/Confirm buttons

3. **Add empty states and onboarding hints**
   - Fresh install guidance on landing page when no articles exist
   - "No articles yet — create the first one" on empty category pages (partially from Phase 3)
   - "No tags yet" on tag management page
   - "No results found" with helpful suggestions on search page

4. **Accessibility audit and fixes**
   - Add `aria-label` attributes to all icon-only buttons (sidebar toggle, expand/collapse chevrons, action menu triggers)
   - Ensure all form inputs have associated `<label>` elements (SearchBar input currently lacks one, tag/API key create forms use visual labels but some miss `htmlFor`)
   - Add keyboard navigation to sidebar tree: arrow keys to navigate between categories, Enter to select
   - Focus management for modals: focus first interactive element on open, return focus to trigger on close
   - Add skip-to-content link at top of page

5. **Add loading states for all async operations**
   - Button loading spinners (disabled + spinner icon) during async operations
   - Contextual loading skeletons for article creation form, category operations, tag management
   - The existing `loading.tsx` pattern is generic; add component-level loading states

#### Files
- **Create**: `apps/web/components/ui/Toast.tsx`, `apps/web/components/ui/ToastProvider.tsx`, `apps/web/lib/hooks/useToast.ts`
- **Modify**: Multiple files from all prior phases (ArticleEditor, RestoreButton, SearchBar, SidebarTree, all admin components, layout)

#### Dependencies: All previous phases (this is the final polish pass)

---

## Verification Plan

After each phase, verify with:

1. **Build check**: `pnpm build` — no type or build errors
2. **Test suite**: `pnpm test` — no regressions
3. **Manual browser testing**:
   - Phase 1: Import each component in a test page, verify rendering and variants
   - Phase 2: Sign in as admin — verify admin link in sidebar. Sign in as editor — verify "New Article" in header. Verify landing page shows recent articles. Test sign-out.
   - Phase 3: Create a new article (draft and publish), archive an article, create/rename/delete a category. Test as viewer — verify action buttons are hidden.
   - Phase 4: Search with filters active, toggle between search modes, verify Cmd+K focuses search, test category-scoped search
   - Phase 5: Create tags in admin, assign tags to an article, verify tags display on article view, click a tag to search
   - Phase 6: Navigate to user detail from admin table, assign a category role override, remove it, verify dashboard stats
   - Phase 7: Trigger toast notifications on save/error, verify keyboard navigation in sidebar, test with screen reader, verify focus management in modals
