# User Testing Bugfix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all 10 issues found during the 2026-03-21 user testing session, bringing the pass rate from 82% to ~100%.

**Architecture:** Each task is a self-contained fix targeting one issue. Major issues (data integrity, broken features) come first, minor issues (cosmetic, typography) after. Two issues (7 & 8) are false positives requiring verification only.

**Tech Stack:** Next.js 15, Express 5, Drizzle ORM, PostgreSQL, React 19, Tailwind CSS v4

**Source:** [Test report](../test-reports/2026-03-21-user-testing-report.md) | [Issue details](../test-reports/2026-03-21-issues.md)

---

## Task 1: Fix post-save redirect missing category slug (Issue 4 — major)

**Root cause:** `POST /api/articles` returns the raw database row which lacks `categoryPath`. The frontend's `articleUrl()` falls back to `/articles/<slug>` (no category prefix), which 404s.

**Files:**
- Modify: `apps/api/src/routes/articles.ts:120-157` (POST handler)
- Test: `apps/api/src/__tests__/routes/articles.test.ts`

**Step 1: Write the failing test**

Add a test that verifies the POST response includes `categoryPath`:

```typescript
it('POST /api/articles returns categoryPath in response', async () => {
  const res = await request(app)
    .post('/api/articles')
    .set('Authorization', `Bearer ${editorToken}`)
    .send({ title: 'Redirect Test', categoryId: testCategoryId, content: {} });

  expect(res.status).toBe(201);
  expect(res.body.categoryPath).toBeDefined();
  expect(Array.isArray(res.body.categoryPath)).toBe(true);
  expect(res.body.categoryPath.length).toBeGreaterThan(0);
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/articles.test.ts`
Expected: FAIL — `res.body.categoryPath` is undefined

**Step 3: Enrich POST response with categoryPath**

In `apps/api/src/routes/articles.ts`, after both `db.insert(articles)` calls inside the POST handler, enrich the response before sending:

Replace both `res.status(201).json(created);` (lines 138 and 152) with:

```typescript
const categoryPath = await buildCategoryPath(created.categoryId);
res.status(201).json({ ...created, categoryPath });
```

`buildCategoryPath` is already imported at line 11.

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/articles.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/articles.ts apps/api/src/__tests__/routes/articles.test.ts
git commit -m "fix: include categoryPath in POST /api/articles response

Fixes 404 after article creation — articleUrl() now receives the
category path and builds the correct redirect URL."
```

---

## Task 2: Fix version restore (Issue 5 — major)

**Root cause:** The `RestoreButton` sends a POST with `Content-Type: application/json` but no body (via `apiClientFetch`). Express's `express.json()` middleware may reject this as invalid JSON, returning a 400 before the handler runs. The error toast also fails to show because the `apiClientFetch` error message is generic.

**Files:**
- Modify: `apps/web/components/RestoreButton.tsx:38-41`
- Test: `apps/api/src/__tests__/routes/versions.test.ts`

**Step 1: Write a test confirming the restore API works with an empty-body POST**

In `apps/api/src/__tests__/routes/versions.test.ts`, verify the restore endpoint works when called without a JSON body:

```typescript
it('POST restore works without a JSON body', async () => {
  // Create an article and save two versions first (setup may already exist)
  const res = await request(app)
    .post(`/api/articles/${testArticleId}/versions/${testVersionId}/restore`)
    .set('Authorization', `Bearer ${editorToken}`)
    .set('Content-Type', 'application/json')
    .send(); // empty body

  expect(res.status).toBe(200);
  expect(res.body.title).toBe(originalTitle);
});
```

**Step 2: Run test**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/versions.test.ts`

If the test passes, the API is fine and the bug is frontend-only.
If the test fails with 400, the API's `express.json()` middleware is rejecting the empty body.

**Step 3a: If API rejects empty body — fix by not sending Content-Type on body-less POST**

In `apps/web/components/RestoreButton.tsx`, change the fetch call to avoid sending `Content-Type: application/json` when there's no body:

```typescript
await apiClientFetch(
  `/api/articles/${articleId}/versions/${versionId}/restore`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
  },
);
```

**Step 3b: If API works fine — the issue is `router.refresh()` not invalidating the page**

Change the success handler to do a full navigation instead:

```typescript
const res = await apiClientFetch<{ slug: string; categoryPath?: string[] }>(
  `/api/articles/${articleId}/versions/${versionId}/restore`,
  { method: 'POST' },
);
toast.success('Version restored');
router.refresh();
```

If `router.refresh()` still doesn't update the server component, use `window.location.reload()` as a fallback.

**Step 4: Manually verify**

1. Navigate to an article, edit it, save
2. Go to history page
3. Click Restore on the original version, confirm
4. Verify: toast appears, article reverts, new version snapshot created

**Step 5: Commit**

```bash
git add apps/web/components/RestoreButton.tsx apps/api/src/__tests__/routes/versions.test.ts
git commit -m "fix: version restore now works correctly

The restore POST was failing silently due to Content-Type/body
mismatch. Verified the API endpoint and fixed the client-side call."
```

---

## Task 3: Fix sidebar collapse persistence across reload (Issue 3 — major)

**Root cause:** The sidebar reads localStorage in a `useEffect` (runs after first paint). The initial render always uses `collapsed = false` (expanded). The `opacity: 0` trick hides the sidebar content but the `w-64` width still takes space, causing a visible layout shift when the effect fires and collapses it. Users perceive this flash as "not persisted."

**Files:**
- Modify: `apps/web/components/SidebarWrapper.tsx`

**Step 1: Move opacity control to the outer wrapper and skip transition on mount**

Replace the entire `SidebarWrapper` component:

```typescript
'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Image from 'next/image';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const STORAGE_KEY = 'dovetail-sidebar-collapsed';

interface SidebarWrapperProps {
  children: ReactNode;
}

export function SidebarWrapper({ children }: SidebarWrapperProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true');
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  return (
    <div className="flex shrink-0" style={{ visibility: mounted ? 'visible' : 'hidden' }}>
      <aside
        className={`bg-sidebar text-sidebar-text min-h-screen flex flex-col border-r border-sidebar-hover ${
          mounted ? 'transition-[width] duration-200' : ''
        } ${collapsed ? 'w-0 overflow-hidden' : 'w-64'}`}
      >
        {children}
        {!collapsed && (
          <button
            onClick={toggle}
            className="mt-auto p-3 border-t border-sidebar-hover flex items-center justify-center hover:bg-sidebar-hover transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </aside>
      {collapsed && (
        <div className="w-10 flex flex-col items-center pt-3 pb-4 bg-sidebar border-r border-sidebar-hover">
          <Image
            src="/logos/mla-mark-white.png"
            alt="Maryland Legal Aid"
            width={24}
            height={40}
            className="w-6 h-auto mb-auto"
          />
          <ThemeToggle />
          <button
            onClick={toggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-text-active hover:bg-sidebar-hover transition-colors"
            aria-label="Expand sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
```

Key changes:
1. `visibility: hidden` on the outer wrapper until mounted (prevents layout shift — element reserves no visible space)
2. Width transition class only applied after mount (prevents the animated collapse on first render)
3. Removed the old `opacity` style from the aside

**Step 2: Manually verify**

1. Collapse the sidebar, reload the page
2. Sidebar should appear already collapsed with no flash
3. Expand the sidebar, reload — should stay expanded
4. Toggle should still animate smoothly after mount

**Step 3: Commit**

```bash
git add apps/web/components/SidebarWrapper.tsx
git commit -m "fix: sidebar collapse state persists across page reload

Hides the entire sidebar wrapper until the client reads localStorage,
then renders the correct state without a layout shift. Transitions
only animate after initial mount."
```

---

## Task 4: Add status badge to article view page (Issue 6 — minor)

**Files:**
- Modify: `apps/web/app/(main)/articles/[...slugPath]/page.tsx:69-92`

**Step 1: Add Badge import**

At the top of the file (after the existing imports around line 9), add:

```typescript
import { Badge } from '../../../../components/ui/Badge';
```

**Step 2: Render the badge next to the updated date**

In `renderViewPage()`, inside the metadata `<div>` at line 77, add the badge before the `<time>` element:

Find the block:
```tsx
<div className="flex items-center gap-3 mt-3 text-xs font-[family-name:var(--font-ui)] text-ink-muted">
  <time dateTime={new Date(article.updatedAt).toISOString()}>
```

Replace with:
```tsx
<div className="flex items-center gap-3 mt-3 text-xs font-[family-name:var(--font-ui)] text-ink-muted">
  <Badge variant={article.status as 'published' | 'draft' | 'archived'}>
    {article.status.charAt(0).toUpperCase() + article.status.slice(1)}
  </Badge>
  <span className="text-border">|</span>
  <time dateTime={new Date(article.updatedAt).toISOString()}>
```

**Step 3: Manually verify**

1. View a published article — green "Published" badge visible
2. View a draft article — yellow "Draft" badge visible
3. Check dark mode — badge colors adapt

**Step 4: Commit**

```bash
git add apps/web/app/(main)/articles/[...slugPath]/page.tsx
git commit -m "feat: show status badge on article view page

Renders Published/Draft/Archived badge in the article header metadata
next to the updated date."
```

---

## Task 5: Fix dark mode login page logo (Issue 1 — minor)

**Root cause:** The Next.js image optimization endpoint returns 400 for `mla-secondary-white.png`. The `ThemeProvider` wraps the login page (confirmed in root layout), and the CSS classes (`dark-hidden`/`light-hidden`) are correct. The image file exists at `apps/web/public/logos/mla-secondary-white.png`. The optimization error is likely caused by the image file format or dimensions being incompatible with Next.js's sharp-based optimizer.

**Files:**
- Modify: `apps/web/app/login/page.tsx:54-69`

**Step 1: Verify the image file is valid**

```bash
file apps/web/public/logos/mla-secondary-white.png
identify apps/web/public/logos/mla-secondary-white.png  # if ImageMagick available
```

**Step 2: Fix by using unoptimized images on the login page**

If the image file is valid but the optimizer can't process it (common with certain PNG color profiles), add `unoptimized` to both Image components:

```tsx
<Image
  src="/logos/mla-secondary-fullcolor.png"
  alt="Maryland Legal Aid"
  width={280}
  height={117}
  className="mx-auto dark-hidden"
  priority
  unoptimized
/>
<Image
  src="/logos/mla-secondary-white.png"
  alt="Maryland Legal Aid"
  width={280}
  height={117}
  className="mx-auto light-hidden"
  priority
  unoptimized
/>
```

This serves the original PNGs directly without the optimization pipeline.

**Step 3: Manually verify**

1. Navigate to `/login` in light mode — full-color logo visible
2. Toggle to dark mode (via browser or another tab) — white logo visible on dark background
3. No console 400 errors

**Step 4: Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "fix: dark mode login page shows white logo correctly

The Next.js image optimizer returned 400 for the white PNG.
Using unoptimized prop to serve the original files directly."
```

---

## Task 6: Fix admin dashboard h1 typography (Issue 2 — minor)

**Root cause:** The h1 "Admin Dashboard" uses `--font-display` (DM Sans). The test expected all admin headings to use Cardo serif. The h2 headings ("Users", "API Keys", etc.) already correctly use `--font-sub` (Cardo). The h1 should also use Cardo for consistency with the brand's heading hierarchy.

**Files:**
- Modify: `apps/web/app/(main)/admin/page.tsx:69`

**Step 1: Change h1 font from display to sub**

Replace:
```tsx
<h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
```

With:
```tsx
<h1 className="font-[family-name:var(--font-sub)] text-3xl font-bold text-ink mb-2 tracking-tight">
```

**Step 2: Manually verify**

1. Navigate to `/admin` — "Admin Dashboard" heading renders in Cardo serif
2. Section card headings still in Cardo
3. Check dark mode — heading renders correctly

**Step 3: Commit**

```bash
git add apps/web/app/(main)/admin/page.tsx
git commit -m "fix: admin dashboard heading uses Cardo serif font

Changes h1 from --font-display (DM Sans) to --font-sub (Cardo)
for consistency with the admin section's heading hierarchy."
```

---

## Task 7: Surface category permission overrides in article view UI (Issue 9 — major)

**Root cause:** The article view page at `apps/web/app/(main)/articles/[...slugPath]/page.tsx:50-51` checks only `session.user.role` (global role). There is no API endpoint for the frontend to query a user's effective role on a specific category. The backend `resolveRole()` function exists but is only used internally by the PATCH handler.

**Files:**
- Create: `apps/api/src/routes/me.ts` (effective role endpoint)
- Modify: `apps/api/src/app.ts` (mount the route)
- Modify: `apps/web/app/(main)/articles/[...slugPath]/page.tsx` (use effective role)
- Test: `apps/api/src/__tests__/routes/me.test.ts`

**Step 1: Write the failing test for the effective-role endpoint**

Create `apps/api/src/__tests__/routes/me.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

describe('GET /api/me/effective-role', () => {
  it('returns the global role when no category override exists', async () => {
    const res = await request(app)
      .get('/api/me/effective-role?categoryId=' + testCategoryId)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
  });

  it('returns the category override role when one exists', async () => {
    // Assumes a category role override has been set up for the viewer
    const res = await request(app)
      .get('/api/me/effective-role?categoryId=' + overriddenCategoryId)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('editor');
  });

  it('returns 400 without categoryId param', async () => {
    const res = await request(app)
      .get('/api/me/effective-role')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(400);
  });
});
```

**Step 2: Create the endpoint**

Create `apps/api/src/routes/me.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validateQuery } from '../utils/validate.js';
import { resolveRole } from '../services/permissions.js';
import type { Role } from '@dovetail/types';

export const meRouter: Router = Router();

const effectiveRoleQuery = z.object({
  categoryId: z.string().uuid(),
});

meRouter.get('/effective-role', authMiddleware, validateQuery(effectiveRoleQuery), async (req: AuthRequest, res) => {
  const { categoryId } = res.locals.query as z.infer<typeof effectiveRoleQuery>;
  const role = await resolveRole(req.user!.id, categoryId, req.user!.role as Role);
  res.json({ role });
});
```

Mount in `apps/api/src/app.ts`:

```typescript
import { meRouter } from './routes/me.js';
// ... after existing route mounts:
app.use('/api/me', meRouter);
```

**Step 3: Run API test**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/me.test.ts`
Expected: PASS

**Step 4: Update the article view page to use effective role**

In `apps/web/app/(main)/articles/[...slugPath]/page.tsx`, replace the global role check with an effective role check:

Replace (lines 50-51):
```typescript
const userRole = session?.user?.role ?? 'viewer';
const canEdit = userRole === 'editor' || userRole === 'admin';
```

With:
```typescript
const globalRole = session?.user?.role ?? 'viewer';
let canEdit = globalRole === 'editor' || globalRole === 'admin';

// Check category-level role override if the user isn't already an editor/admin
if (!canEdit && session?.user && article.categoryId) {
  try {
    const { role: effectiveRole } = await apiFetch<{ role: string }>(
      `/api/me/effective-role?categoryId=${article.categoryId}`,
    );
    canEdit = effectiveRole === 'editor' || effectiveRole === 'admin';
  } catch {
    // Fall back to global role
  }
}
```

Apply the same pattern in `renderHistoryPage()` (line 168-169) and `renderEditPage()` (line 125-129).

**Step 5: Manually verify**

1. Log in as admin, go to `/admin/users`, assign viewer an "editor" override on a category
2. Log in as viewer, navigate to an article in that category — Edit/Actions buttons visible
3. Navigate to an article in a different category — no Edit/Actions buttons
4. Log in as admin, remove the override — viewer no longer sees Edit buttons

**Step 6: Commit**

```bash
git add apps/api/src/routes/me.ts apps/api/src/app.ts apps/api/src/__tests__/routes/me.test.ts apps/web/app/(main)/articles/[...slugPath]/page.tsx
git commit -m "feat: surface category permission overrides in article view UI

Adds GET /api/me/effective-role endpoint that resolves the user's
effective role for a given category (walking the ancestor chain).
Article view/edit/history pages now check this endpoint so viewers
with category-level editor overrides see Edit/Actions buttons."
```

---

## Task 8: Add article deduplication to import engine (Issue 10 — major)

**Root cause:** The import engine deduplicates categories (checks slug+parent before inserting) but not articles. When an article slug conflicts, it appends a timestamp suffix and inserts a duplicate. Re-importing the same ZIP creates 338 duplicate articles.

**Files:**
- Modify: `apps/api/src/services/import/import-engine.ts:197-236`
- Test: `apps/api/src/__tests__/services/import-engine.test.ts`

**Step 1: Write the failing test**

```typescript
it('skips articles that already exist with the same slug and category', async () => {
  // First import
  const engine1 = new ImportEngine(opts);
  await engine1.run();
  const countAfterFirst = await db.select({ count: sql<number>`count(*)` }).from(articles);

  // Second import of the same data
  const engine2 = new ImportEngine({ ...opts, jobId: newJobId });
  await engine2.run();
  const countAfterSecond = await db.select({ count: sql<number>`count(*)` }).from(articles);

  // Article count should not increase
  expect(Number(countAfterSecond[0].count)).toBe(Number(countAfterFirst[0].count));
});
```

**Step 2: Add duplicate detection before article insert**

In `apps/api/src/services/import/import-engine.ts`, in the `importArticle()` method, add a duplicate check before the insert (before line 203):

```typescript
// Check for existing article with same slug in same category
const existing = await db.select({ id: articles.id })
  .from(articles)
  .where(and(eq(articles.slug, slug), eq(articles.categoryId, categoryId)));

if (existing.length > 0) {
  throw new Error(`Article "${art.title}" already exists in this category (slug: ${slug})`);
}
```

This makes re-imported articles fail with an error that gets logged to the job's error log and reported in the completion screen, rather than silently creating duplicates.

**Step 3: Run test**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/import-engine.test.ts`
Expected: PASS

**Step 4: Update the slug-conflict fallback to also check for duplicates**

Remove or modify the catch block (lines 217-236) that appends a timestamp suffix on slug conflict. Instead, let the duplicate error propagate so it's counted as an import error:

Replace the existing try/catch for article insert:

```typescript
let articleId: string;
// Check for existing article with same slug in same category
const existing = await db.select({ id: articles.id })
  .from(articles)
  .where(and(eq(articles.slug, slug), eq(articles.categoryId, categoryId)));

if (existing.length > 0) {
  throw new Error(`Duplicate article skipped: "${art.title}" (slug: ${slug})`);
}

const [created] = await db.insert(articles).values({
  title: art.title,
  slug,
  categoryId,
  authorId: this.opts.userId,
  content,
  plainText,
  status: this.opts.defaultStatus,
  createdAt,
  updatedAt: now,
  publishedAt,
}).returning();
articleId = created.id;
```

**Step 5: Manually verify**

1. Run a fresh import of `test-export.zip` — all articles import
2. Re-import the same ZIP — completion screen shows "N articles had errors" with duplicate messages
3. Verify no duplicate articles in the database

**Step 6: Commit**

```bash
git add apps/api/src/services/import/import-engine.ts apps/api/src/__tests__/services/import-engine.test.ts
git commit -m "fix: import engine detects and skips duplicate articles

Checks for existing article with same slug and category before
inserting. Duplicates are reported as errors in the import job
log instead of silently creating entries with modified slugs."
```

---

## Task 9: Verify search filters and tag links (Issues 7 & 8 — false positives)

**These issues appear to already be fixed in the codebase.**

**Issue 7 (Search filters):** `apps/web/components/SearchFilters.tsx` already implements date range (lines 180-224), tag filters (lines 226-252), and "Clear all filters" (lines 254-262). These are inside a collapsible panel. The test likely ran with the panel collapsed and before tags were created (suite 2.5 runs before 2.6).

**Issue 8 (Tag links):** `apps/web/app/(main)/articles/[...slugPath]/page.tsx:97-103` already renders tags as `<Link>` components pointing to `/search?tags=${tag.id}`.

**Verification steps:**
1. Navigate to `/search?q=law`, click the "Filters" toggle — verify date range, tags, and clear-all appear
2. Set a date range preset (e.g., "Last 30 days") — URL updates with `from` param
3. Create a tag, assign it to an article, view the article — verify tag badge is a clickable link
4. Click the tag — verify navigation to `/search?tags=...`

**No code changes needed.** These can be closed as verified-working.

---

## Summary

| Task | Issue | Severity | Type |
|------|-------|----------|------|
| 1 | Post-save redirect 404 | major | API fix |
| 2 | Version restore broken | major | Debug + fix |
| 3 | Sidebar persistence flash | major | Frontend fix |
| 4 | Status badge missing | minor | Frontend addition |
| 5 | Dark mode login logo | minor | Image fix |
| 6 | Admin heading typography | minor | CSS fix |
| 7 | Category permissions in UI | major | API + frontend |
| 8 | Import deduplication | major | Backend logic |
| 9 | Search filters + tag links | false positive | Verification only |
