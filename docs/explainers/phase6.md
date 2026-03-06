# Phase 6: Frontend — What We Built and Why

This document explains what was accomplished in Phase 6 of the Dovetail project, written for a non-technical audience.

## What is Phase 6?

Phase 6 transforms Dovetail from a headless API into a usable application. Before this phase, users could only interact with the knowledge base through raw API calls. After Phase 6, users have a full web interface for browsing categories, reading articles, editing content, and viewing version history — all with role-appropriate controls.

## What We Built

### 1. Frontend Prerequisites

**Styling system** — We adopted Tailwind CSS with a custom editorial theme designed for a legal knowledge base. The visual language draws from law libraries and academic journals: warm parchment tones, serif display typography (Playfair Display for headings, Source Serif 4 for body text), and a clean, authoritative feel. The colour palette centres on deep ink tones with a saddlebrown accent, avoiding the generic blue-and-white aesthetic common in web applications.

**API communication layer** — Two API client utilities handle the different ways frontend code talks to the backend:
- **Server-side client** (`lib/api.ts`) — Used by pages that render on the server. It reads the authentication cookie from the incoming request and forwards it to the API, so the backend knows which user is making the request.
- **Client-side client** (`lib/api-client.ts`) — Used by interactive components running in the browser. The browser automatically includes cookies, so this client just needs to set `credentials: 'include'`.

**Session provider** — Wraps the application in a `SessionProvider` so any component can check the current user's role (viewer, editor, or admin) and show or hide features accordingly.

### 2. Category Sidebar and Page Layout (`components/Sidebar.tsx`, `app/(main)/layout.tsx`)

The main layout divides the screen into a dark sidebar and a light content area. The sidebar displays the full category hierarchy as a collapsible tree.

**How the tree works:** The API returns categories as a flat list, each with a `parentId`. The frontend assembles this into a nested tree structure, then renders it recursively. Users can expand and collapse branches, and the currently active category is highlighted.

**Route group pattern:** All authenticated pages live inside an `(main)` route group. This is a Next.js convention — the parentheses mean it doesn't affect the URL, but it lets all pages share the sidebar layout. The home page (`/`), category pages (`/categories/housing-law`), and article pages (`/articles/tenant-rights`) all get the sidebar automatically.

**Why this matters:** The sidebar gives users constant context about where they are in the knowledge base hierarchy, without needing to navigate back and forth.

### 3. Category Article List (`app/(main)/categories/[slug]/page.tsx`)

When a user clicks a category in the sidebar, they see a list of all articles in that category. Each article shows its title, last-updated date, and a status badge (published, draft, or archived). The badges use colour coding — green for published, amber for draft, grey for archived.

**Slug-based routing:** URLs use human-readable slugs (`/categories/tenant-rights`) rather than UUIDs. The page fetches all categories, finds the one matching the URL slug, then fetches articles for that category.

**Why this matters:** Users can browse the knowledge base by topic, quickly scan what's available, and see at a glance which articles are published versus still in draft.

### 4. Article View Page (`app/(main)/articles/[slug]/page.tsx`)

The article view page displays the full content of an article with proper formatting. It shows the title, last-updated date, and a link to view version history.

**Tiptap rendering:** Article content is stored as structured JSON (Tiptap format). To display it, we use a read-only Tiptap editor instance that converts the JSON back into formatted HTML. This ensures the rendered output exactly matches what the author saw when editing — headings, lists, blockquotes, code blocks, and all other formatting are preserved.

**Role-aware edit button:** The page checks the current user's session. If they have editor or admin role, an "Edit" button appears in the header. Viewers see the article content but no edit controls. This prevents confusion — viewers don't see buttons they can't use.

**Why this matters:** Clean, readable article presentation is the primary use case for a knowledge base. The role-aware UI ensures editors can quickly jump to editing while viewers get an uncluttered reading experience.

### 5. Article Editor (`app/(main)/articles/[slug]/edit/page.tsx`, `components/ArticleEditor.tsx`)

The editor provides a rich-text editing experience for creating and updating articles. It's a client-side component (runs in the browser) built on Tiptap.

**Title editing:** The title is an inline editable field at the top of the editor, styled to match the display typography. Changes are saved alongside content changes.

**Save and publish workflow:**
- **Save draft** — Persists the current state without making it visible to viewers. Uses `PATCH /api/articles/:id`, which automatically creates a version snapshot of the previous content.
- **Publish** — Saves the content, then sets the article status to "published". After publishing, the user is redirected back to the article view page.

**Access control:** The edit page checks the user's role on the server before rendering. Viewers are redirected to the article view page — they never see the editor.

**Why this matters:** Editors need a smooth writing experience that preserves their work and gives them control over when content becomes visible. The automatic versioning on every save means no edit is ever lost.

### 6. Version History (`app/(main)/articles/[slug]/history/page.tsx`)

The version history page shows a chronological list of all previous versions of an article, newest first. Each entry shows the version number, the title at that point in time, and when it was saved.

**Restore with confirmation:** Editors and admins see a "Restore" button next to each version. Clicking it reveals a confirmation prompt ("Sure? Yes / No") to prevent accidental restores. Restoring a version saves the current content as a new version first (so nothing is lost), then overwrites the article with the old version's content.

**Why this matters:** For a legal knowledge base, being able to see exactly what changed and when — and to roll back if needed — is essential. The two-step restore confirmation prevents costly accidents.

### 7. Pre-existing Bug Fixes

While building the frontend, we fixed several pre-existing type errors that prevented the web application from compiling:

- **Auth configuration** — The Entra ID (Microsoft) OAuth provider was passing a `tenantId` parameter that the library no longer accepts as a top-level option. Fixed to use only the `issuer` URL.
- **Session type augmentation** — The `session.user.role` property was being set in callbacks but TypeScript didn't know about it. Added a type declaration to extend the NextAuth session type.
- **Export type portability** — Several exports had inferred types that referenced internal library paths, making them non-portable. Added explicit type annotations.
- **Drizzle ORM version mismatch** — The web app was pulling a different version of `drizzle-orm` than the database package, causing incompatible types. Pinned to the same version.

## Architecture Decisions

**Server components by default** — Category lists, article views, and version history are all server components. They fetch data on the server and send rendered HTML to the browser. This means faster page loads and no loading spinners for initial content.

**Client components only when needed** — The sidebar tree (needs expand/collapse state), article content renderer (needs Tiptap), article editor (needs user interaction), and restore button (needs confirmation state) are client components. Everything else renders on the server.

**Loading and error boundaries** — Every route has a `loading.tsx` (skeleton animation) and `error.tsx` (retry button). Next.js uses these automatically — if a page is still loading, users see a skeleton; if something fails, they see a friendly error with a retry option.

## What's Next

Phase 7 adds full-text search using PostgreSQL's built-in text search capabilities, allowing users to find articles by keyword with a search bar in the navigation.
