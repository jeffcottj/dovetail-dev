# User Testing Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Execute 132 manual test steps across the Dovetail knowledge base application using AI-driven browser automation, producing a bug report at the end.

**Architecture:** Three-phase approach — seed the database via the import feature, then systematically test every feature area, then run cross-cutting multi-role scenarios. The agent uses Playwright CLI and Claude in Chrome for browser interactions, and curl for API-only tests (RAG endpoint).

**Tech Stack:** Playwright CLI (browser automation), Claude in Chrome (visual inspection, screenshots), curl (HTTP requests for RAG API testing)

---

## Reference: Dev Login Flow

All authentication uses the dev login bypass. The three seeded accounts:

| Key | User ID | Email | Name | Role |
|-----|---------|-------|------|------|
| `admin` | `00000000-0000-4000-8000-000000000001` | `admin@local.dovetail.test` | Local Admin | admin |
| `editor` | `00000000-0000-4000-8000-000000000002` | `editor@local.dovetail.test` | Local Editor | editor |
| `viewer` | `00000000-0000-4000-8000-000000000003` | `viewer@local.dovetail.test` | Local Viewer | viewer |

**To log in as any user:**
1. Navigate to `http://localhost:3000/login`
2. Click the button labeled with the user name (e.g., "Local Admin")
3. The page submits a `POST /api/dev/login` with form data `user=admin` (or `editor`/`viewer`)
4. Browser receives a `303` redirect to `/` with an `authjs.session-token` cookie set

**To switch users:**
1. Click "Sign out" in the sidebar user menu (bottom of sidebar)
2. Wait for redirect to `/login`
3. Click the button for the desired user

## Reference: Bug Report Procedure

On any assertion failure:

1. Take a screenshot of the current browser state
2. Read browser console for errors (`mcp__claude-in-chrome__read_console_messages`)
3. Log the failure:
   - **Step ID** (e.g., 2.5.4)
   - **Screenshot** filename
   - **Expected** behavior (from the assertion column)
   - **Actual** behavior (what happened instead)
   - **Console errors** (if any)
   - **Severity:** blocker (feature broken), major (degraded UX), minor (cosmetic/polish)
4. Continue to the next step

## Reference: Test Report File

Create `docs/test-reports/2026-03-21-user-testing-report.md` at the start. Append results to it as testing progresses. Final structure:

```markdown
# User Testing Report — 2026-03-21

## Summary
- **Total steps:** 132
- **Passed:** N
- **Failed:** N
- **Skipped:** N

## Blockers
(list)

## Major Issues
(list)

## Minor Issues
(list)

## Detailed Results
(per-phase, per-suite results)
```

---

## Task 0: Verify Prerequisites

**Files:**
- Check: `test-export.zip` exists at repo root
- Create: `docs/test-reports/2026-03-21-user-testing-report.md`

**Step 1: Verify Postgres is running**

Run: `docker compose ps postgres`
Expected: Status shows "healthy" or "running"

If not running, run: `docker compose up postgres -d` and wait for healthy status.

**Step 2: Verify dev servers are running**

Run: `curl -s http://localhost:3001/health`
Expected: 200 response (API is up)

Run: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login`
Expected: 200 (Web is up)

If not running, run: `pnpm dev` in background and wait for both to respond.

**Step 3: Verify test-export.zip exists**

Run: `ls -la test-export.zip`
Expected: File exists (~50MB)

If not present, run: `cd sample-import && zip -r ../test-export.zip articles/ assets/ && cd ..`

**Step 4: Initialize test report**

Create `docs/test-reports/2026-03-21-user-testing-report.md` with the template from the reference section above. Fill in placeholders — counts will be updated as testing progresses.

---

## Task 1: Phase 1 — Setup, Import & Smoke Test (Steps 1.1–1.11)

**Logged in as:** admin

**Step 1: Navigate to app root (1.1)**

Navigate to `http://localhost:3000`
Assert: URL redirects to `/login`. Login page visible with three dev user buttons: "Local Admin", "Local Editor", "Local Viewer".

**Step 2: Log in as admin (1.2)**

Click the "Local Admin" button on the login page.
Assert: Redirects to `/`. Landing page renders. Text "Local Admin" or "Admin" appears in the sidebar user section.

**Step 3: Verify sidebar (1.3)**

Inspect the left sidebar.
Assert:
- A category tree is visible (may be empty if DB is fresh — this is fine pre-import)
- An "Admin" link is visible in the sidebar
- A Sun/Moon theme toggle icon is visible in the sidebar footer

**Step 4: Navigate to admin dashboard (1.4)**

Navigate to `http://localhost:3000/admin`
Assert: Dashboard loads with stat cards. Look for cards labeled "Users", "Articles", "Categories", "Tags" (or similar). An "Import" card should also be present.

**Step 5: Navigate to import page (1.5)**

Click the "Import" card, or navigate to `http://localhost:3000/admin/import`
Assert: Upload wizard renders. A dashed-border dropzone area is visible with text like "Drag & drop a ZIP file here, or click to browse".

**Step 6: Upload test-export.zip (1.6)**

Upload the file `test-export.zip` (located at the repo root: `/home/john/repos/dovetail/test-export.zip`) via the dropzone.
Assert: Preview step appears with:
- Article count approximately 338
- Category count > 10
- Attachments count > 0
- A category tree preview is visible

**Step 7: Test category tree interaction (1.7)**

In the category tree preview, click on a category that has a `▸` expand arrow.
Assert: Category expands to show children. Click again — it collapses.

**Step 8: Start import (1.8)**

Verify the "Default status" dropdown is set to "Draft". Click "Start Import".
Assert:
- Page transitions to an importing/progress view
- A progress bar appears and fills
- A counter shows articles being imported (e.g., "X / 338 articles")
- Import completes (bar reaches 100%)

**Step 9: Bulk publish (1.9)**

On the completion screen, click the "Publish All" button.
Assert: A toast notification appears confirming published articles (e.g., "Published 338 articles" or similar count).

**Step 10: Verify landing page is populated (1.10)**

Navigate to `http://localhost:3000`
Assert: The "Recently Updated" section shows articles. Article titles from the import are visible.

**Step 11: Verify sidebar categories (1.11)**

Inspect the sidebar category tree.
Assert: Categories from the import are visible (e.g., "Consumer Debt Collection", "Family Law", or other Flowlu export categories). Hierarchy is present — some categories are nested under parents.

Take a screenshot of the populated landing page for the report.

---

## Task 2: Suite 2.1 — Branding & Dark Mode (Steps 2.1.1–2.1.9)

**Logged in as:** admin (from Task 1)

**Step 1: Inspect sidebar branding (2.1.1)**

On the landing page, inspect the sidebar.
Assert: Sidebar background is a deep blue color (MLA Deep Blue #094A6B). A white MLA logo is visible at the top of the sidebar.

**Step 2: Check typography (2.1.2)**

Inspect headings and body text on the page.
Assert: Headings appear in a sans-serif font (DM Sans). Body text appears in a different sans-serif font (Archivo). Use JavaScript to check: `getComputedStyle(document.querySelector('h1')).fontFamily` should contain "DM Sans", and body text element's fontFamily should contain "Archivo".

**Step 3: Toggle dark mode (2.1.3)**

Click the Sun/Moon toggle icon in the sidebar footer.
Assert: Page colors change to a dark navy/charcoal palette. Sidebar and main content area both switch to dark backgrounds with light text.

**Step 4: Dark mode login page (2.1.4)**

Navigate to `http://localhost:3000/login` (while in dark mode).
Assert: Login page has dark background. MLA logo appears in white.

**Step 5: Toggle back to light mode (2.1.5)**

Navigate back to the app (log in again as admin if needed). Click the theme toggle.
Assert: Colors revert to light mode. Navigate to `/login` — logo appears in full color (not white).

**Step 6: Collapsed sidebar (2.1.6)**

Log back in as admin if needed. Find and click the sidebar collapse button.
Assert: Sidebar collapses to a narrow strip. A flame/mark icon is visible (compact logo). The theme toggle is still accessible.

**Step 7: Article editor theming (2.1.7)**

Expand the sidebar. Navigate to any imported article (click one from the landing page or sidebar category). Click "Edit".
Assert: Tiptap editor area renders without white background artifacts against the themed page. If the article has H2/H3 headings, they should render in a serif font (Cardo).

**Step 8: Admin page theming (2.1.8)**

Navigate to `http://localhost:3000/admin`
Assert: Section headings appear in serif font (Cardo). Stat cards and navigation cards are themed consistently with the overall design (no unstyled/white boxes).

**Step 9: Browser tab title (2.1.9)**

Check the browser tab/page title.
Assert: Title contains "Maryland Legal Aid". Use JavaScript: `document.title` should include "Maryland Legal Aid".

---

## Task 3: Suite 2.2 — Navigation, Chrome & Landing Page (Steps 2.2.1–2.2.10)

**Logged in as:** admin

**Step 1: User menu in sidebar (2.2.1)**

On the landing page, inspect the bottom of the sidebar.
Assert: User section shows an avatar (or placeholder), the name "Local Admin", a role badge (e.g., "admin"), and a "Sign out" button.

**Step 2: Admin link (2.2.2)**

In the sidebar, look for an admin link/icon.
Assert: Admin link is present and visible (this user is an admin).

**Step 3: New Article button (2.2.3)**

Inspect the page header area.
Assert: A "New Article" button (or "+ New Article") is visible. Admin has editor+ permissions, so this should be present.

**Step 4: Landing page content (2.2.4)**

On the landing page (`/`), inspect the main content area.
Assert: A "Recently Updated" section (or similar heading) is visible with article entries from the import.

**Step 5: Sidebar collapse persistence (2.2.5)**

Click the sidebar collapse button. Reload the page (navigate to `/` or press refresh).
Assert: Sidebar remains collapsed after reload (state persisted via localStorage).

**Step 6: Sidebar expand persistence (2.2.6)**

Click to expand the sidebar. Reload the page.
Assert: Sidebar remains expanded after reload.

**Step 7: Keyboard shortcut (2.2.7)**

Press Ctrl+K (Linux/Windows) or Cmd+K (Mac).
Assert: The search input in the header receives focus. Cursor should be active in the search field.

**Step 8: Breadcrumbs (2.2.8)**

Navigate to any imported article. Click "View history" (or navigate to the article's history page).
Assert: Breadcrumbs are visible at the top showing the navigation path (e.g., Home > Category > Article > History).

**Step 9: Sign out (2.2.9)**

Click "Sign out" in the sidebar user menu.
Assert: Redirects to the `/login` page.

**Step 10: Log back in (2.2.10)**

Click "Local Admin" to log back in.
Assert: Redirects to `/`. Landing page loads with content.

---

## Task 4: Suite 2.3 — UI Foundation Components (Steps 2.3.1–2.3.6)

**Logged in as:** admin

**Step 1: Card component (2.3.1)**

Navigate to `http://localhost:3000/admin`
Assert: Stat cards render with visible borders/shadows. Hover over a card — visual transition occurs (shadow change, slight elevation, or color shift).

**Step 2: Badge component (2.3.2)**

Navigate to any imported article's view page.
Assert: A status badge is visible (e.g., "Published" in a colored badge). The badge has distinct styling (background color, rounded corners).

**Step 3: Button component (2.3.3)**

Click "New Article" in the header.
Assert: The button has primary variant styling (filled background, contrasting text). The `/articles/new` page loads.

**Step 4: DropdownMenu — open and close (2.3.4)**

Navigate back to an article view page. Look for an actions menu (⋯ or three-dot icon).
Click it.
Assert: A dropdown menu opens with options (Edit, Move to category, Archive, or similar).
Click anywhere outside the dropdown.
Assert: Dropdown closes.

**Step 5: DropdownMenu — Escape key (2.3.5)**

Click the ⋯ actions menu again to open the dropdown.
Press the Escape key.
Assert: Dropdown closes.

**Step 6: Modal — open and dismiss (2.3.6)**

Click the ⋯ actions menu, then click "Move to category".
Assert: A modal dialog opens with a backdrop overlay and a category tree selector.
Click the backdrop (outside the modal content).
Assert: Modal closes.

---

## Task 5: Suite 2.4 — Content Management (Steps 2.4.1–2.4.21)

**Logged in as:** admin

**Step 1: New article page (2.4.1)**

Click "New Article" in the header (or navigate to `/articles/new`).
Assert: Page loads with a title input field and a category dropdown/selector.

**Step 2: Create article (2.4.2)**

Type "Test Article Alpha" in the title field. Select any imported category from the dropdown. Click Save (or the save button).
Assert: Page redirects to the article's edit page. A toast notification confirms the save.

**Step 3: Add body content (2.4.3)**

In the Tiptap editor, type a heading (use formatting toolbar or markdown shortcuts), a paragraph, and a bulleted list.
Assert: Content renders correctly in the editor. Click Save. Toast confirms save.

**Step 4: Publish article (2.4.4)**

Click the "Publish" button.
Assert: Status badge changes to "Published". Toast notification appears confirming publication.

**Step 5: Verify in category listing (2.4.5)**

Navigate to the category page where "Test Article Alpha" was created (click the category in the sidebar).
Assert: "Test Article Alpha" appears in the article list on that category page.

**Step 6: Edit existing article (2.4.6)**

Click on "Test Article Alpha" to view it. Click the "Edit" button.
Assert: Editor loads with the previously entered content (title, heading, paragraph, list) intact.

**Step 7: Update article (2.4.7)**

Change the title to "Test Article Alpha — Edited". Click Save.
Assert: Toast confirms save.

**Step 8: View version history (2.4.8)**

Click "View history" link on the article page.
Assert: Version history page shows at least 2 versions with timestamps and version numbers.

**Step 9: Restore previous version (2.4.9)**

Click "Restore" on the original version (the earliest one).
Assert: Article reverts to original title "Test Article Alpha". Toast confirms restoration.

**Step 10: Move to category — open modal (2.4.10)**

Navigate to the article view. Click the ⋯ actions menu, then "Move to category".
Assert: Modal opens with a category tree selector.

**Step 11: Move to category — confirm (2.4.11)**

Select a different category from the tree. Click the confirm/move button.
Assert: Toast confirms the move. Navigate to the new category — "Test Article Alpha" appears there.

**Step 12: Archive — confirmation modal (2.4.12)**

Navigate to "Test Article Alpha". Click ⋯ → "Archive".
Assert: A confirmation modal/dialog appears asking to confirm archival.

**Step 13: Archive — confirm (2.4.13)**

Click the confirm button in the archive dialog.
Assert: Article status changes to "Archived". Article no longer appears in the category listing.

**Step 14: Empty state CTA (2.4.14)**

Create a new category via the sidebar "+" button (name it "Empty Test Category"). Navigate to that category page.
Assert: An empty state message appears with a CTA like "Create the first article".

**Step 15: Empty state CTA navigation (2.4.15)**

Click the "Create the first article" CTA.
Assert: Navigates to `/articles/new?categoryId=...` (URL contains the categoryId parameter). The category dropdown is pre-selected.

**Step 16: Create category (2.4.16)**

Navigate back. In the sidebar, click "+" next to the "Categories" heading.
Assert: A CategoryModal opens with a name field and optional parent selector.

**Step 17: Submit new category (2.4.17)**

Enter "Test Category" as the name. Select any imported category as parent. Submit.
Assert: "Test Category" appears in the sidebar nested under the selected parent.

**Step 18: Category context menu (2.4.18)**

Hover over "Test Category" in the sidebar. Click the "..." context menu.
Assert: Menu shows "Rename" and "Delete" options.

**Step 19: Rename category (2.4.19)**

Click "Rename". Change the name to "Renamed Category". Submit.
Assert: Category name updates to "Renamed Category" in the sidebar.

**Step 20: Delete empty category (2.4.20)**

Click "..." on "Renamed Category" → "Delete".
Assert: Category is removed from the sidebar.

**Step 21: Delete category with content (2.4.21)**

Click "..." on an imported category that has articles or child categories. Click "Delete".
Assert: An error message appears stating the category cannot be deleted because it has articles or children.

Also delete "Empty Test Category" created in Step 14 to clean up.

---

## Task 6: Suite 2.5 — Search & Discovery (Steps 2.5.1–2.5.14)

**Logged in as:** admin

**Step 1: Basic search (2.5.1)**

Navigate to `http://localhost:3000/search?q=law`
Assert: Results page loads with search results matching "law" from imported articles.

**Step 2: Result card details (2.5.2)**

Inspect the search result cards.
Assert: Each card shows: article title, text snippet/excerpt, category name, and a relevance score bar or indicator.

**Step 3: Search mode toggle (2.5.3)**

Look for the search mode toggle/buttons.
Assert: Three options are visible: "Full-text" (or "Fulltext"), "AI-powered" (or "Semantic"), and "Hybrid".

**Step 4: Switch to semantic mode (2.5.4)**

Click "AI-powered" / "Semantic" mode.
Assert: URL updates to include `mode=semantic`. A mode badge or indicator changes. Results may refresh.

**Step 5: Semantic results (2.5.5)**

If results appear in semantic mode:
Assert: Scores are shown as similarity percentages (0–100%).

**Step 6: Semantic empty state (2.5.6)**

If no results appear (embeddings not yet generated):
Assert: A helpful message is displayed (not a crash or error page). Something like "No results found" with a suggestion.

**Step 7: Hybrid mode (2.5.7)**

Click "Hybrid" mode.
Assert: URL updates to include `mode=hybrid`. Results refresh.

**Step 8: Category filter (2.5.8)**

Select a category from the filter dropdown.
Assert: Results are scoped to that category. URL contains a `categoryId` parameter.

**Step 9: Date range filter (2.5.9)**

Set a date range — look for preset buttons like "Last 30 days" or use date inputs.
Assert: Results filtered. URL contains `from` and/or `to` parameters.

**Step 10: Tag filter (2.5.10)**

If tags have been created (from Task 8 / Suite 2.6), select a tag filter.
Assert: Results filtered by tag. If no tags exist yet, note as "skipped — tags not yet created" and revisit after Task 8.

**Step 11: Clear all filters (2.5.11)**

Click "Clear all filters" (or equivalent reset button).
Assert: All filters reset. URL returns to just `?q=law` (no categoryId, from, to, tags params).

**Step 12: Pagination (2.5.12)**

If search results span multiple pages, click "Next" (or page 2).
Assert: Page 2 loads with different results. All previously active filters are preserved in the URL.

**Step 13: Category-scoped search (2.5.13)**

Navigate to any imported category page. Find the search input on the category page. Type a search term and submit.
Assert: Navigates to `/search?q=...&categoryId=...` with the category pre-selected in filters.

**Step 14: Empty search (2.5.14)**

Navigate to `/search` (no query) or clear the search input.
Assert: A message prompts the user to enter a search term (not a crash or empty results).

---

## Task 7: Suite 2.6 — Tags (Steps 2.6.1–2.6.12)

**Logged in as:** admin

**Step 1: Tag admin page (2.6.1)**

Navigate to `http://localhost:3000/admin/tags`
Assert: Tag management page loads. A form to create tags is visible.

**Step 2: Create first tag (2.6.2)**

Type "Family Law" in the tag name input. Click Create (or submit).
Assert: "Family Law" appears in the tag list. Toast confirms creation.

**Step 3: Create more tags (2.6.3)**

Create tags "Housing" and "Benefits".
Assert: Both appear in the tag list (now 3 tags total).

**Step 4: Open article editor (2.6.4)**

Navigate to any imported article. Click "Edit".
Assert: Editor loads with the article content.

**Step 5: Tag picker search (2.6.5)**

Locate the TagPicker component (may be below the title or in a sidebar panel). Type "Family" into it.
Assert: Dropdown filters to show "Family Law".

**Step 6: Assign tags (2.6.6)**

Select "Family Law" and "Housing" from the tag picker.
Assert: Both tags appear as selected/assigned (chips, badges, or checkmarks).

**Step 7: Save with tags (2.6.7)**

Click Save.
Assert: Save succeeds. Reload the edit page — tags are still assigned.

**Step 8: View article tags (2.6.8)**

Navigate to the article view (non-edit mode).
Assert: Tag badges "Family Law" and "Housing" are displayed on the article.

**Step 9: Tag badge links to search (2.6.9)**

Click the "Family Law" tag badge.
Assert: Navigates to `/search?tags=...`. Search results include the tagged article.

**Step 10: Admin dashboard tag count (2.6.10)**

Navigate to `http://localhost:3000/admin`
Assert: Tags card shows count of 3 (or current tag count). Card links to `/admin/tags`.

**Step 11: Delete tag (2.6.11)**

Navigate to `/admin/tags`. Delete the "Benefits" tag.
Assert: "Benefits" is removed from the list. Two tags remain.

**Step 12: Tags during article creation (2.6.12)**

Navigate to `/articles/new`. Fill in a title, select a category. Look for the TagPicker — assign "Family Law". Save.
Assert: Article is created. View the article — "Family Law" tag badge is displayed.

---

## Task 8: Suite 2.7 — Admin Users & RBAC (Steps 2.7.1–2.7.9)

**Logged in as:** admin

**Step 1: Admin stats (2.7.1)**

Navigate to `http://localhost:3000/admin`
Assert: Stat cards show user counts broken down by role. At minimum: 1 admin, 1 editor, 1 viewer.

**Step 2: User table (2.7.2)**

Navigate to `http://localhost:3000/admin/users`
Assert: Table loads with at least 3 rows (the seeded admin, editor, viewer users).

**Step 3: Table columns (2.7.3)**

Inspect the user table.
Assert: Columns include email, name, avatar (or placeholder), role, provider, and created date.

**Step 4: Click user row (2.7.4)**

Click on the row for "Local Editor" (email: `editor@local.dovetail.test`).
Assert: Navigates to `/admin/users/00000000-0000-4000-8000-000000000002` (or similar detail page URL).

**Step 5: User detail page (2.7.5)**

Inspect the user detail page.
Assert: Shows avatar/placeholder, name "Local Editor", email, provider "google", and global role "editor".

**Step 6: Assign category role override (2.7.6)**

In the CategoryRoleManager section, select an imported category and assign a "viewer" role override.
Assert: The override appears in the list of category role assignments.

**Step 7: Remove category role override (2.7.7)**

Click the remove/delete button next to the category role override just created.
Assert: Override disappears from the list.

**Step 8: Return to user list (2.7.8)**

Navigate back to `/admin/users`.
Assert: User table loads correctly with all users still listed.

**Step 9: Inline role dropdown (2.7.9)**

On the user table, find the role dropdown for one of the users. Change it (e.g., temporarily change viewer to editor via the inline dropdown).
Assert: Role updates without page navigation. Then change it back to the original role.

---

## Task 9: Suite 2.8 — Admin API Keys (Steps 2.8.1–2.8.7)

**Logged in as:** admin

**Step 1: API key page (2.8.1)**

Navigate to `http://localhost:3000/admin/api-keys`
Assert: API key management page loads with a form to create keys and a list section.

**Step 2: Create API key (2.8.2)**

Type "Test RAG Key" in the name input. Click Create.
Assert: A raw API key string is displayed (shown only once). The key also appears in the list below.

**Step 3: Store the raw key (2.8.3)**

Copy the raw key value displayed after creation. **Store this value** — it will be used in Task 11 (RAG API testing). Save it to a temporary file:

Run: `echo "RAG_TEST_KEY=<the-raw-key>" > /tmp/dovetail-test-api-key.txt`

**Step 4: Verify key list (2.8.4)**

After dismissing/closing the raw key display, inspect the key list.
Assert: "Test RAG Key" appears in the list showing name, creator ("Local Admin"), created date. The raw key is NOT displayed in the list.

**Step 5: Create second key (2.8.5)**

Create another key named "Disposable Key".
Assert: Raw key displayed. "Disposable Key" appears in the list.

**Step 6: Revoke key (2.8.6)**

Click the revoke button next to "Disposable Key".
Assert: Key shows as revoked (visual indicator — strikethrough, "revoked" label, or disabled state).

**Step 7: Empty name validation (2.8.7)**

Clear the name input and try to create a key with an empty name.
Assert: An error message appears below the form (e.g., "Name is required"). No key is created.

---

## Task 10: Suite 2.9 — Polish & Accessibility (Steps 2.9.1–2.9.10)

**Logged in as:** admin

For steps 2.9.1–2.9.3, create a temporary article to test the full lifecycle:

**Step 1: Toast on save (2.9.1)**

Navigate to `/articles/new`, create an article "Toast Test Article" in any category, save it.
Assert: A toast notification slides in from the top or corner with a success message. Toast has a colored background (green/success variant).

**Step 2: Toast on publish (2.9.2)**

Click Publish on the article.
Assert: A toast notification appears confirming publication.

**Step 3: Toast on archive (2.9.3)**

Click ⋯ → Archive → Confirm.
Assert: A toast notification appears confirming archival.

**Step 4: Button loading states (2.9.4)**

Create another test article. When clicking Save, watch the Save button closely.
Assert: A loading spinner appears inside/next to the button. The button is visually disabled (not clickable) during the operation.

**Step 5: Modal focus management — open (2.9.5)**

Navigate to a published article. Click ⋯ → "Move to category".
Assert: The modal opens and the first interactive element (likely the category selector or a button) has focus. Use JavaScript: `document.activeElement` should be inside the modal.

**Step 6: Modal focus management — close (2.9.6)**

Close the modal (click Cancel or press Escape).
Assert: Focus returns to the ⋯ trigger button. Use JavaScript: `document.activeElement` should be the trigger element.

**Step 7: Skip-to-content link (2.9.7)**

Navigate to any page. Press Tab once.
Assert: A "Skip to content" link becomes visible (may appear at the top of the page).

**Step 8: Search bar aria-label (2.9.8)**

Inspect the search input element.
Assert: Element has an `aria-label` attribute. Use JavaScript: `document.querySelector('input[type="search"], input[aria-label]')` and check for aria-label.

**Step 9: Sidebar nav aria-label (2.9.9)**

Inspect the sidebar `<nav>` element.
Assert: Has an `aria-label` attribute. Use JavaScript: `document.querySelector('nav[aria-label]')` should exist.

**Step 10: Toast aria-live (2.9.10)**

Trigger any action that produces a toast (e.g., save an article). Inspect the toast container element.
Assert: The toast or its container has `aria-live="polite"` or `aria-live="assertive"` or `role="alert"`.

---

## Task 11: Suite 2.10 — RAG API (Steps 2.10.1–2.10.6)

**No browser needed — use curl/HTTP requests.**

First, read the stored API key:

Run: `cat /tmp/dovetail-test-api-key.txt`

Use the key value for all Bearer token requests below.

**Step 1: Successful RAG search (2.10.1)**

Run:
```bash
curl -s -w '\n%{http_code}' http://localhost:3001/api/v1/rag/search \
  -H "Authorization: Bearer <RAG_TEST_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query": "family law", "limit": 5}'
```
Assert: HTTP 200. Response body contains a `results` array.

**Step 2: Result shape (2.10.2)**

Inspect the response from Step 1.
Assert: Each result object has keys: `articleId`, `articleTitle`, `articleUrl`, `chunkText`, `score`. If no embeddings exist yet, `results` may be an empty array — this is acceptable.

**Step 3: Category filter (2.10.3)**

First, get a category ID:
```bash
curl -s http://localhost:3001/api/categories \
  -H "Cookie: $(cat /tmp/dovetail-admin-cookie.txt 2>/dev/null || echo '')"
```
Pick a category ID from the response, then:
```bash
curl -s -w '\n%{http_code}' http://localhost:3001/api/v1/rag/search \
  -H "Authorization: Bearer <RAG_TEST_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query": "family law", "limit": 5, "categoryIds": ["<category-id>"]}'
```
Assert: HTTP 200. Results scoped to that category (or empty if no embeddings for that category).

**Step 4: No auth (2.10.4)**

Run:
```bash
curl -s -w '\n%{http_code}' http://localhost:3001/api/v1/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "family law", "limit": 5}'
```
Assert: HTTP 401.

**Step 5: Revoked key (2.10.5)**

Use the "Disposable Key" that was revoked in Task 9 Step 6. If you stored that key, use it. Otherwise, note as skipped (key was not stored).

Run:
```bash
curl -s -w '\n%{http_code}' http://localhost:3001/api/v1/rag/search \
  -H "Authorization: Bearer <REVOKED_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query": "family law", "limit": 5}'
```
Assert: HTTP 401.

**Step 6: Empty query validation (2.10.6)**

Run:
```bash
curl -s -w '\n%{http_code}' http://localhost:3001/api/v1/rag/search \
  -H "Authorization: Bearer <RAG_TEST_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query": "", "limit": 5}'
```
Assert: HTTP 400 with a validation error message.

---

## Task 12: Suite 2.11 — Workflow Bug Fixes (Steps 2.11.1–2.11.4)

**Logged in as:** admin

**Step 1: No CORS errors (2.11.1)**

Navigate to a few pages: `/`, `/admin`, `/search?q=test`. After each navigation, check the browser console.
Assert: No CORS-related errors in the console output. Use `mcp__claude-in-chrome__read_console_messages` with pattern "CORS" or "cors".

**Step 2: Admin users shows count (2.11.2)**

Navigate to `http://localhost:3000/admin/users`
Assert: The page shows the actual user count (at least 3). It does NOT show "0 users" when the API is reachable.

**Step 3: Publish without category (2.11.3)**

Navigate to `http://localhost:3000/articles/new`. Enter a title but do NOT select a category. Click Publish (or Save).
Assert: A message "Please select a category" (or similar validation message) appears. The form does not submit.

**Step 4: Sidebar button positioning (2.11.4)**

On any page with a long sidebar (categories visible), scroll the page. Then collapse and expand the sidebar.
Assert: The collapse/expand button stays in-flow within the sidebar (not overlapping main content). No visual overlap with page content.

---

## Task 13: Suite 3.1 — Article Lifecycle Across Roles (Steps 3.1.1–3.1.11)

**Step 1: Log in as editor (3.1.1)**

Sign out from admin. Log in as editor (click "Local Editor" on login page).
Assert: Landing page loads. "New Article" button visible in header. No "Admin" link in sidebar.

**Step 2: Create draft (3.1.2)**

Click "New Article". Create an article titled "Editor's Draft" in any imported category. Save as draft (do not publish).
Assert: Article created successfully. Redirects to editor page.

**Step 3: Verify drafts section (3.1.3)**

Navigate to `/` (landing page).
Assert: "Editor's Draft" appears in the "Recent Drafts" section.

**Step 4: Publish (3.1.4)**

Navigate to "Editor's Draft" and publish it.
Assert: Status badge changes to "Published". Toast confirms.

**Step 5: Log in as viewer (3.1.5)**

Sign out. Log in as viewer (click "Local Viewer").
Assert: Landing page loads. No "New Article" button. No "Admin" link in sidebar. No "Recent Drafts" section.

**Step 6: View article as viewer (3.1.6)**

Navigate to "Editor's Draft" article (find it via search or browse the category).
Assert: Article content is visible. No "Edit" button. No ⋯ actions menu.

**Step 7: Direct URL — new article (3.1.7)**

Navigate to `http://localhost:3000/articles/new`
Assert: Redirected to `/` or an access denied message shown. The article creation form is NOT available.

**Step 8: Direct URL — admin (3.1.8)**

Navigate to `http://localhost:3000/admin`
Assert: "Admin access required" message shown, or redirected away.

**Step 9: Log in as admin (3.1.9)**

Sign out. Log in as admin.
Assert: Full access — admin link visible, new article button visible.

**Step 10: Archive as admin (3.1.10)**

Navigate to "Editor's Draft". Click ⋯ → Archive → Confirm.
Assert: Article archived successfully.

**Step 11: Search as viewer for archived article (3.1.11)**

Sign out. Log in as viewer. Search for "Editor's Draft".
Assert: No results — archived articles are excluded from search.

---

## Task 14: Suite 3.2 — Category Permission Cascade (Steps 3.2.1–3.2.8)

**Step 1: Log in as admin (3.2.1)**

Log in as admin.
Assert: Admin access confirmed.

**Step 2: Open viewer's detail page (3.2.2)**

Navigate to `/admin/users`. Click on the "Local Viewer" user row.
Assert: User detail page loads for the viewer user.

**Step 3: Assign editor override (3.2.3)**

In the CategoryRoleManager, select a specific imported category (note which one). Assign an "editor" role override.
Assert: Override appears in the list. Note the category name for later steps.

**Step 4: Log in as viewer (3.2.4)**

Sign out. Log in as viewer.
Assert: Landing page loads normally.

**Step 5: Check permissions in overridden category (3.2.5)**

Navigate to an article in the category where the editor override was assigned.
Assert: Edit button IS visible. Actions menu (⋯) IS visible. The viewer now has editor permissions in this category.

**Step 6: Check permissions in other category (3.2.6)**

Navigate to an article in a DIFFERENT category (one without an override).
Assert: No Edit button. No ⋯ actions menu. The viewer has default viewer permissions here.

**Step 7: Remove override (3.2.7)**

Sign out. Log in as admin. Navigate to the viewer's user detail page. Remove the category role override.
Assert: Override removed from the list.

**Step 8: Verify override removed (3.2.8)**

Sign out. Log in as viewer. Navigate to an article in the previously overridden category.
Assert: No Edit button. No ⋯ actions menu. Viewer permissions are back to default.

---

## Task 15: Suite 3.3 — Search Reflects Data Mutations (Steps 3.3.1–3.3.8)

**Step 1: Log in as editor (3.3.1)**

Sign out. Log in as editor.
Assert: Session established.

**Step 2: Create canary article (3.3.2)**

Create and publish an article titled "Unique Canary Phrase XYZ123" in any category.
Assert: Article published successfully.

**Step 3: Search for canary (3.3.3)**

Navigate to `/search?q=Canary+Phrase+XYZ123` (full-text mode).
Assert: "Unique Canary Phrase XYZ123" appears in search results.

**Step 4: Rename article (3.3.4)**

Navigate to the article. Click Edit. Change the title to "Renamed Canary Article". Save.
Assert: Save succeeds.

**Step 5: Search for old title (3.3.5)**

Navigate to `/search?q=Unique+Canary+Phrase+XYZ123`
Assert: No results (the old title is no longer in the search index).

**Step 6: Search for new title (3.3.6)**

Navigate to `/search?q=Renamed+Canary+Article`
Assert: The article appears in search results with the new title.

**Step 7: Archive article (3.3.7)**

Sign out. Log in as admin. Navigate to "Renamed Canary Article". Archive it.
Assert: Archived successfully.

**Step 8: Search for archived article (3.3.8)**

Navigate to `/search?q=Renamed+Canary+Article`
Assert: No results — archived articles are excluded from search.

---

## Task 16: Suite 3.4 — Import Deduplication (Steps 3.4.1–3.4.5)

**Logged in as:** admin

**Step 1: Log in as admin (3.4.1)**

Ensure logged in as admin.
Assert: Session established.

**Step 2: Re-upload same ZIP (3.4.2)**

Navigate to `/admin/import`. Upload `test-export.zip` again.
Assert: Preview renders with the same article/category/attachment counts as the first import.

**Step 3: Execute re-import (3.4.3)**

Click "Start Import" (default status: draft).
Assert: Import runs. Errors are expected for duplicate article slugs. Progress bar advances and completes.

**Step 4: Verify error count (3.4.4)**

On the completion screen, check the results.
Assert: "N articles had errors" is displayed (where N is approximately the full article count, since all slugs already exist).

**Step 5: Verify no duplicate categories (3.4.5)**

Navigate to the sidebar or `http://localhost:3001/api/categories` (via curl with admin cookie).
Assert: No duplicate category names in the tree. Each category appears only once — the import engine reused existing categories rather than creating duplicates.

---

## Task 17: Suite 3.5 — Dark Mode Persistence (Steps 3.5.1–3.5.4)

**Logged in as:** admin

**Step 1: Switch to dark mode (3.5.1)**

Click the theme toggle to switch to dark mode.
Assert: Dark palette applied — dark backgrounds, light text throughout the page.

**Step 2: Navigate through pages (3.5.2)**

Navigate through this sequence, checking dark mode at each stop:
1. Landing page (`/`)
2. Click a category in the sidebar
3. Click an article within that category
4. Click Edit on the article
5. Navigate to `/search?q=law`
6. Navigate to `/admin`

Assert: Dark mode persists across ALL page transitions. No flash of light mode between navigations.

**Step 3: Reload persistence (3.5.3)**

Reload the browser page.
Assert: Dark mode is still active after reload (persisted via localStorage/cookies).

**Step 4: Switch back to light mode (3.5.4)**

Click the theme toggle to switch back to light mode.
Assert: Light palette restored — light backgrounds, dark text.

---

## Task 18: Compile Final Report

**Step 1: Aggregate results**

Review all notes and screenshots collected during Tasks 1–17.

**Step 2: Write the final report**

Update `docs/test-reports/2026-03-21-user-testing-report.md` with:
- Summary counts (passed/failed/skipped out of 132 total steps)
- Blocker issues (features completely broken)
- Major issues (degraded UX, data integrity problems)
- Minor issues (cosmetic, polish)
- Per-suite pass/fail breakdown
- Screenshots for all failures

**Step 3: Commit the report**

```bash
git add docs/test-reports/
git commit -m "test: add user testing report for 2026-03-21"
```
