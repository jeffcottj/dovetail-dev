# User Testing Plan — AI-Driven Browser Automation

**Date:** 2026-03-21
**Approach:** Phased (Setup → Feature Matrix → Cross-Cutting Scenarios)
**Executor:** AI agent using Playwright CLI and Claude in Chrome (headless browser)
**Auth method:** `POST /api/dev/login` (dev bypass — no OAuth flow)
**Test accounts:** Pre-seeded admin, editor, and viewer users
**Bug handling:** Screenshot + log each failure, continue testing, produce summary report at end

---

## Phase 1 — Setup, Import & Smoke Test

**Goal:** Establish a working session, seed the database via the import feature, and verify baseline app health.

### Prerequisites

The agent must verify before starting:

- `docker compose up postgres -d` is running (Postgres healthy)
- `pnpm dev` is running (API on :3001, Web on :3000)
- Sample ZIP exists: `cd sample-import && zip -r ../test-export.zip articles/ assets/ && cd ..`

### Steps

| # | Action | Assertion |
|---|--------|-----------|
| 1.1 | Navigate to `http://localhost:3000` | Redirects to `/login` |
| 1.2 | Use dev login as admin | Redirects to `/`, landing page renders with user name |
| 1.3 | Verify sidebar | Category tree renders, admin link visible, theme toggle present |
| 1.4 | Navigate to `/admin` | Dashboard loads with stat cards (Users, Articles, Categories, Tags) |
| 1.5 | Navigate to `/admin/import` | Upload wizard renders with dropzone |
| 1.6 | Upload `test-export.zip` | Preview step appears: article count (~338), category tree, attachments count |
| 1.7 | Expand/collapse a category in preview tree | Tree nodes toggle correctly |
| 1.8 | Leave default status as "Draft", click Start Import | Progress bar appears, counter increments, completes |
| 1.9 | On completion screen, click "Publish All" | Toast confirms "Published N articles" |
| 1.10 | Navigate to `/` | Landing page shows recently updated articles (populated from import) |
| 1.11 | Verify sidebar categories | Imported categories appear in sidebar tree with hierarchy |

---

## Phase 2 — Systematic Feature Coverage

### 2.1 Branding & Dark Mode (PR #32)

| # | Action | Assertion |
|---|--------|-----------|
| 2.1.1 | On any page, inspect sidebar | Background is MLA Deep Blue (#094A6B), white logo visible |
| 2.1.2 | Check page typography | Headings use DM Sans, body text uses Archivo |
| 2.1.3 | Click Sun/Moon toggle in sidebar footer | All colors swap to dark navy-charcoal palette |
| 2.1.4 | Check dark mode login page | Navigate to `/login` — MLA white logo on dark background |
| 2.1.5 | Toggle back to light mode | Colors revert; login page shows full-color logo |
| 2.1.6 | Collapse sidebar | Flame mark icon visible, theme toggle still accessible |
| 2.1.7 | Navigate to an imported article, click Edit | Tiptap editor renders without `bg-white` artifacts; H2/H3 in Cardo serif |
| 2.1.8 | Navigate to `/admin` | Section headings in Cardo, stat cards and nav cards themed correctly |
| 2.1.9 | Check browser tab | Title contains "Maryland Legal Aid" |

### 2.2 Navigation, Chrome & Landing Page (PR #23)

| # | Action | Assertion |
|---|--------|-----------|
| 2.2.1 | On landing page, verify user menu in sidebar | Avatar, name, role badge, sign-out button visible |
| 2.2.2 | Verify admin link in sidebar user menu | Link present (admin user) |
| 2.2.3 | Verify "New Article" button in header | Button visible (admin has editor+ permissions) |
| 2.2.4 | Verify landing page sections | "Recently Updated" articles section populated with imported data |
| 2.2.5 | Collapse sidebar, reload page | Sidebar stays collapsed (localStorage persistence) |
| 2.2.6 | Expand sidebar | Sidebar expands, state persists on next reload |
| 2.2.7 | Press Cmd+K (or Ctrl+K) | Search input receives focus |
| 2.2.8 | Navigate to any article, click "View history" | Breadcrumbs render correctly showing category path |
| 2.2.9 | Click sign-out | Redirects to login page |
| 2.2.10 | Log back in as admin via dev login | Session restored, landing page loads |

### 2.3 UI Foundation Components (PR #22)

| # | Action | Assertion |
|---|--------|-----------|
| 2.3.1 | On `/admin`, inspect stat cards | Card component renders with hover transition |
| 2.3.2 | On any article view, check status indicator | Badge component renders (published/draft/archived variant) |
| 2.3.3 | Click "New Article" button | Button component renders with correct primary variant styling |
| 2.3.4 | On article view, click actions dropdown (⋯ menu) | DropdownMenu opens on click, closes on click-outside |
| 2.3.5 | Press Escape while dropdown is open | DropdownMenu closes |
| 2.3.6 | Trigger any modal (e.g., "Move to category" from article actions) | Modal opens with backdrop, click backdrop to dismiss |

### 2.4 Content Management — Articles & Categories (PRs #24, #25)

| # | Action | Assertion |
|---|--------|-----------|
| 2.4.1 | Click "New Article" in header | `/articles/new` loads with title input and category dropdown |
| 2.4.2 | Fill title "Test Article Alpha", select an imported category, click Save | Redirects to article editor page; toast confirms save |
| 2.4.3 | Add body content in Tiptap editor (heading, paragraph, list) | Content renders in editor; save succeeds |
| 2.4.4 | Click Publish | Status badge changes to "published"; toast confirms |
| 2.4.5 | Navigate to the article's category page | "Test Article Alpha" appears in the article list |
| 2.4.6 | Return to article view, click Edit | Editor loads with existing content intact |
| 2.4.7 | Change the title to "Test Article Alpha — Edited", save | Toast confirms save |
| 2.4.8 | Click "View history" | Version history shows at least 2 versions (original + edit) |
| 2.4.9 | Click Restore on the original version | Article reverts to original title; toast confirms |
| 2.4.10 | From article actions menu (⋯), click "Move to category" | Modal opens with category tree selector |
| 2.4.11 | Select a different category, confirm | Toast confirms move; article now appears under new category |
| 2.4.12 | From article actions menu, click "Archive" | Confirmation modal appears |
| 2.4.13 | Confirm archive | Status changes to "archived"; article removed from category listing |
| 2.4.14 | Navigate to a category with no articles (create one first if needed) | Empty state CTA "Create the first article" appears |
| 2.4.15 | Click the empty-state CTA | Navigates to `/articles/new?categoryId=...` with category pre-selected |
| 2.4.16 | In sidebar, click "+" next to Categories heading | CategoryModal opens |
| 2.4.17 | Enter name "Test Category", select a parent, submit | Category appears in sidebar under the selected parent |
| 2.4.18 | Click "..." context menu on "Test Category" | Menu shows Rename and Delete options |
| 2.4.19 | Click Rename, change to "Renamed Category", submit | Category name updates in sidebar |
| 2.4.20 | Click "..." → Delete on the (now-empty) category | Category removed from sidebar |
| 2.4.21 | Try to delete a category that has articles or children | Error message: cannot delete category with articles/children |

### 2.5 Search & Discovery (PR #26)

| # | Action | Assertion |
|---|--------|-----------|
| 2.5.1 | Navigate to `/search?q=law` | Results page loads with matches from imported articles |
| 2.5.2 | Verify result cards | Each shows title, snippet, category name, relevance score bar |
| 2.5.3 | Check search mode toggle | Three options visible: Full-text, AI-powered, Hybrid |
| 2.5.4 | Toggle to "AI-powered" (semantic) | URL updates with `mode=semantic`; mode badge changes |
| 2.5.5 | If results appear, verify similarity percentage | Score shown as percentage (0–100%) |
| 2.5.6 | If no results (embeddings not yet generated), verify empty state | Helpful suggestion message displayed (not a crash) |
| 2.5.7 | Toggle to "Hybrid" | URL updates; results refresh |
| 2.5.8 | Select a category from filter dropdown | Results scoped to that category; URL has `categoryId` param |
| 2.5.9 | Set a date range via preset (e.g., "Last 30 days") | Results filtered; URL has `from`/`to` params |
| 2.5.10 | Select a tag filter (if tags exist on imported articles) | Results filtered by tag |
| 2.5.11 | Click "Clear all filters" | All filters reset; URL returns to `?q=law` |
| 2.5.12 | If results span multiple pages, click Next | Page 2 loads; all active filters preserved in URL |
| 2.5.13 | Navigate to a category page, use the category search input | Navigates to `/search?q=...&categoryId=...` with pre-filtered results |
| 2.5.14 | Search with no query (empty `q`) | Message prompts user to enter a search term |

### 2.6 Tags (PR #27)

| # | Action | Assertion |
|---|--------|-----------|
| 2.6.1 | Navigate to `/admin/tags` | Tag management page loads |
| 2.6.2 | Create a tag "Family Law" | Tag appears in list; toast confirms |
| 2.6.3 | Create tags "Housing" and "Benefits" | Both appear in list |
| 2.6.4 | Navigate to an imported article, click Edit | Editor loads |
| 2.6.5 | Locate TagPicker, search for "Family" | Dropdown filters to "Family Law" |
| 2.6.6 | Select "Family Law" and "Housing" | Tags assigned; visible as selected |
| 2.6.7 | Save the article | Tags persist after save |
| 2.6.8 | View the article (non-edit mode) | Tag badges display ("Family Law", "Housing") |
| 2.6.9 | Click the "Family Law" tag badge | Navigates to `/search?tags=...`; results include this article |
| 2.6.10 | Navigate to `/admin`, verify Tags card | Card shows count of 3 tags, links to `/admin/tags` |
| 2.6.11 | On `/admin/tags`, delete the "Benefits" tag | Tag removed from list |
| 2.6.12 | Create a new article, add tags during creation | After save, article has tags assigned |

### 2.7 Admin — Users & RBAC (PR #28)

| # | Action | Assertion |
|---|--------|-----------|
| 2.7.1 | Navigate to `/admin` | Stat cards show correct user counts by role (admin/editor/viewer) |
| 2.7.2 | Navigate to `/admin/users` | User table loads with all seeded users (admin, editor, viewer) |
| 2.7.3 | Verify table columns | Email, name, avatar, role, provider, created date all visible |
| 2.7.4 | Click on the editor user's row | Navigates to `/admin/users/[id]` detail page |
| 2.7.5 | Verify user detail page | Shows avatar, name, email, provider, global role |
| 2.7.6 | In CategoryRoleManager, assign editor a "viewer" override on an imported category | Override appears in the list |
| 2.7.7 | Remove the category role override | Override disappears from list |
| 2.7.8 | Return to `/admin/users` | User table still loads correctly |
| 2.7.9 | Use inline role dropdown on a user row (without clicking the row) | Role updates via dropdown without navigating away |

### 2.8 Admin — API Keys

| # | Action | Assertion |
|---|--------|-----------|
| 2.8.1 | Navigate to `/admin/api-keys` | API key management page loads |
| 2.8.2 | Enter name "Test RAG Key", click Create | Raw key displayed once; key appears in list |
| 2.8.3 | Copy the raw key value | (Agent stores this for suite 2.10 RAG testing) |
| 2.8.4 | Verify the key list entry | Shows name, creator, created date; raw key NOT shown in list |
| 2.8.5 | Create a second key "Disposable Key" | Second key appears in list |
| 2.8.6 | Revoke "Disposable Key" | Key shows as revoked in list |
| 2.8.7 | Attempt to create a key with empty name | Error message displayed below form |

### 2.9 Polish & Accessibility (PR #29)

| # | Action | Assertion |
|---|--------|-----------|
| 2.9.1 | Edit an article, click Save | Toast notification appears (success variant) with slide-in animation |
| 2.9.2 | Publish an article | Toast notification appears |
| 2.9.3 | Archive an article | Toast notification appears |
| 2.9.4 | During any async operation (save, publish), watch the button | Loading spinner appears on button; button disabled during operation |
| 2.9.5 | Open any modal (e.g., Move to category) | First interactive element auto-focused |
| 2.9.6 | Close the modal | Focus returns to the element that triggered the modal |
| 2.9.7 | Load any page, press Tab immediately | Skip-to-content link appears |
| 2.9.8 | Inspect search bar | Has `aria-label` attribute |
| 2.9.9 | Inspect sidebar nav | Has `aria-label` attribute |
| 2.9.10 | Trigger a toast, inspect it | Has `aria-live` attribute for screen reader announcement |

### 2.10 RAG API (via HTTP — not browser)

Uses the API key captured in step 2.8.3.

| # | Action | Assertion |
|---|--------|-----------|
| 2.10.1 | `POST /api/v1/rag/search` with Bearer token and `{"query": "family law", "limit": 5}` | 200 response with `results` array |
| 2.10.2 | Verify result shape | Each result has `articleId`, `articleTitle`, `articleUrl`, `chunkText`, `score` |
| 2.10.3 | `POST /api/v1/rag/search` with `categoryIds` filter | Results scoped to specified categories |
| 2.10.4 | `POST /api/v1/rag/search` with no Bearer token | 401 response |
| 2.10.5 | `POST /api/v1/rag/search` with the revoked "Disposable Key" | 401 response |
| 2.10.6 | `POST /api/v1/rag/search` with empty query | 400 validation error |

### 2.11 Workflow Bug Fixes (PR #30)

| # | Action | Assertion |
|---|--------|-----------|
| 2.11.1 | Open browser console on any page | No CORS errors logged |
| 2.11.2 | Navigate to `/admin/users` when API is reachable | Shows user count (not "0 users") |
| 2.11.3 | Navigate to `/articles/new`, click Publish without selecting a category | "Please select a category" message appears |
| 2.11.4 | Scroll sidebar content, collapse/expand | Button stays in-flow; no overlap with main content |

---

## Phase 3 — Cross-Cutting Scenarios

### 3.1 Article Lifecycle Across Roles

| # | Action | Assertion |
|---|--------|-----------|
| 3.1.1 | Log in as editor via dev login | Landing page loads; "New Article" button visible; no admin link in sidebar |
| 3.1.2 | Create article "Editor's Draft" in a category, save as draft | Article created successfully |
| 3.1.3 | Verify "Editor's Draft" appears in "Recent Drafts" on landing page | Draft listed |
| 3.1.4 | Publish the article | Status changes to published |
| 3.1.5 | Log in as viewer via dev login | Landing page loads; no "New Article" button; no admin link; no drafts section |
| 3.1.6 | Navigate to "Editor's Draft" article | Article content visible; no Edit button; no actions menu (⋯) |
| 3.1.7 | Navigate to `/articles/new` directly | Redirected away or access denied |
| 3.1.8 | Navigate to `/admin` directly | "Admin access required" or redirect |
| 3.1.9 | Log in as admin via dev login | Full access restored |
| 3.1.10 | Navigate to "Editor's Draft", archive it | Article archived successfully |
| 3.1.11 | Log in as viewer, search for "Editor's Draft" | Article does NOT appear in search results |

### 3.2 Category Permission Cascade

| # | Action | Assertion |
|---|--------|-----------|
| 3.2.1 | Log in as admin | Admin access confirmed |
| 3.2.2 | Navigate to `/admin/users`, open the viewer user's detail page | User detail loads |
| 3.2.3 | Assign the viewer an "editor" override on a specific imported category | Override saved |
| 3.2.4 | Log in as viewer | Landing page loads normally |
| 3.2.5 | Navigate to an article in the overridden category | Edit button and actions menu ARE visible (editor permissions) |
| 3.2.6 | Navigate to an article in a different category | No Edit button; no actions menu (still viewer) |
| 3.2.7 | Log in as admin, remove the category override | Override removed |
| 3.2.8 | Log in as viewer, return to the previously overridden category article | Edit button gone (back to viewer) |

### 3.3 Search Reflects Data Mutations

| # | Action | Assertion |
|---|--------|-----------|
| 3.3.1 | Log in as editor | Session established |
| 3.3.2 | Create and publish an article titled "Unique Canary Phrase XYZ123" | Article published |
| 3.3.3 | Search for "Canary Phrase XYZ123" (full-text mode) | Article appears in results |
| 3.3.4 | Edit the article, change title to "Renamed Canary Article" | Save succeeds |
| 3.3.5 | Search for "Unique Canary Phrase XYZ123" | No results (old title gone from index) |
| 3.3.6 | Search for "Renamed Canary Article" | Article appears in results |
| 3.3.7 | Log in as admin, archive the article | Archived |
| 3.3.8 | Search for "Renamed Canary Article" | No results (archived articles excluded) |

### 3.4 Import Deduplication

| # | Action | Assertion |
|---|--------|-----------|
| 3.4.1 | Log in as admin | Session established |
| 3.4.2 | Navigate to `/admin/import`, upload the same `test-export.zip` again | Preview renders with same counts |
| 3.4.3 | Execute import (default status: draft) | Import runs; errors expected for duplicate slugs |
| 3.4.4 | Verify completion screen shows error count | "N articles had errors" displayed |
| 3.4.5 | Navigate to `/api/categories` or sidebar | No duplicate categories (deduplication worked) |

### 3.5 Dark Mode Persistence Across Navigation

| # | Action | Assertion |
|---|--------|-----------|
| 3.5.1 | Log in as admin, switch to dark mode | Dark palette applied |
| 3.5.2 | Navigate through: landing → category → article → edit → search → admin | Dark mode persists across all page transitions |
| 3.5.3 | Reload the browser | Dark mode still active (persisted) |
| 3.5.4 | Switch back to light mode | Light palette restored |

---

## Bug Report Format

For each failure, the agent captures:

- **Step ID** (e.g., 2.5.4)
- **Screenshot** of the current state
- **Expected** vs **Actual** behavior
- **Browser console errors** (if any)
- **Severity:** blocker (feature broken), major (degraded UX), minor (cosmetic/polish)

At the end, the agent produces a summary report grouped by severity.

---

## Test Counts

| Phase | Suites | Steps |
|-------|--------|-------|
| Phase 1 — Setup & Smoke | 1 | 11 |
| Phase 2 — Feature Coverage | 11 | 94 |
| Phase 3 — Cross-Cutting | 5 | 27 |
| **Total** | **17** | **132** |
