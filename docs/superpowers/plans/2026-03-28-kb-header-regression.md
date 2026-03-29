# KB Header Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the KB-scoped top header so `/kb/[kbSlug]` pages once again show the `New Article` button, the search bar, and the header user area.

**Architecture:** Put the header shell in the KB layout, not back in the stripped global `(main)` layout. That keeps the search bar inside `KbProvider`, so it routes to `/kb/[kbSlug]/search`, and it avoids reintroducing a global header that would fall back to the deleted `/search` route.

**Tech Stack:** Next.js 15 App Router, React 19, NextAuth 5 beta, seeded local dev auth, curl-based local smoke checks.

---

### Task 1: Restore The Missing KB Header Shell

**Files:**
- Modify: `apps/web/app/(main)/kb/[kbSlug]/layout.tsx`
- Reuse: `apps/web/components/SearchBar.tsx`
- Reuse: `apps/web/components/HeaderUserArea.tsx`
- Reuse: `apps/web/components/RoleGate.tsx`
- Reuse: `apps/web/components/ui/Button.tsx`

- [ ] **Step 1: Add the missing header imports to the KB layout**

```tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { FilePlus } from 'lucide-react';
import { HeaderUserArea } from '../../../../components/HeaderUserArea';
import { RoleGate } from '../../../../components/RoleGate';
import { SearchBar } from '../../../../components/SearchBar';
import { Button } from '../../../../components/ui/Button';
```

- [ ] **Step 2: Render the header inside `KbProvider` and above `children`**

```tsx
<div className="flex-1 flex flex-col">
  <header className="border-b border-border-light px-6 py-3 flex items-center justify-between">
    <div className="flex flex-1 items-center gap-3">
      <RoleGate minimumRole="editor">
        <Link href={`/kb/${kb.slug}/articles/new`}>
          <Button size="sm" className="whitespace-nowrap">
            <FilePlus className="w-5 h-5" />
            New Article
          </Button>
        </Link>
      </RoleGate>
      <Suspense>
        <SearchBar />
      </Suspense>
    </div>
    <HeaderUserArea />
  </header>
  {children}
</div>
```

- [ ] **Step 3: Keep the scope narrow**

Do not move this header back to `apps/web/app/(main)/layout.tsx`. `SearchBar` currently falls back to `/search` outside `KbProvider`, and that route was removed during the KB-prefixed routing work. Restoring the header globally would create a second bug on non-KB routes.

- [ ] **Step 4: Verify the route still renders**

Run:

```bash
pnpm --filter @dovetail/web dev
```

Expected: the web app starts on `http://localhost:3000` without a compile error in `apps/web/app/(main)/kb/[kbSlug]/layout.tsx`.

### Task 2: Remove The KB Home Page Stopgap Actions

**Files:**
- Modify: `apps/web/app/(main)/kb/[kbSlug]/page.tsx`

- [ ] **Step 1: Remove the inline action row that was acting as a fallback for the missing header**

Delete this block:

```tsx
<div className="flex items-center gap-3 mb-10">
  {isEditor && (
    <Link href={`/kb/${kbSlug}/articles/new`}>
      <Button><FilePlus className="w-4 h-4" /> New Article</Button>
    </Link>
  )}
  <Link href={`/kb/${kbSlug}/search`}>
    <Button variant="secondary"><Search className="w-4 h-4" /> Search</Button>
  </Link>
</div>
```

- [ ] **Step 2: Remove the imports that become unused after deleting the stopgap row**

Change the top of the file to:

```tsx
import { Clock, FileEdit } from 'lucide-react';
import { auth } from '../../../../auth';
import { apiFetch } from '../../../../lib/api';
import { getKbBySlug } from '../../../../lib/kb';
import { hasMinimumRole } from '../../../../lib/roles';
import { articleUrl } from '../../../../lib/article-url';
import { Card } from '../../../../components/ui/Card';
import { Badge } from '../../../../components/ui/Badge';
import type { Article, Role } from '@dovetail/types';
```

- [ ] **Step 3: Leave the KB title and content sections alone**

The page should still start with the KB name/description block:

```tsx
<main id="main-content" className="flex-1 p-8">
  <header className="mb-8">
    <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
      {kb.name}
    </h1>
    {kb.description && (
      <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">{kb.description}</p>
    )}
  </header>
```

### Task 3: Reproduce And Verify The Fix

**Files:**
- Verify: `apps/web/app/(main)/kb/[kbSlug]/layout.tsx`
- Verify: `apps/web/app/(main)/kb/[kbSlug]/page.tsx`

- [ ] **Step 1: Start the lightest local stack needed for this repro**

Run:

```bash
docker compose up -d postgres
pnpm --filter @dovetail/api dev
pnpm --filter @dovetail/web dev
```

Expected: Postgres is healthy, API listens on `http://localhost:3001`, and web listens on `http://localhost:3000`.

- [ ] **Step 2: Sign in with seeded dev auth and load a real KB page**

Run:

```bash
rm -f /tmp/dovetail-cookies.txt
curl -sS http://localhost:3000/login | rg "Local Admin"
curl -sS -c /tmp/dovetail-cookies.txt -X POST -d 'user=admin' http://localhost:3000/api/dev/login >/dev/null
curl -sS -b /tmp/dovetail-cookies.txt http://localhost:3000/kb/default | rg "Default|Notice Requirements for Evictions"
```

Expected: the seeded KB route responds and includes the seeded KB/article content.

- [ ] **Step 3: Confirm the restored top pane visually in the browser**

Open:

```text
http://localhost:3000/kb/default
```

Expected:
- A top header row appears above the page body.
- The left side of that row shows `New Article` and the search input.
- The right side of that row shows the header user area with theme toggle, user identity, and `Sign out`.
- The old inline `New Article` / `Search` row below the KB title is gone.

- [ ] **Step 4: Confirm the search bar stays KB-scoped**

In the browser:
1. Focus the search input with `Cmd+K` or `Ctrl+K`.
2. Enter `notice`.
3. Submit the form.

Expected: navigation goes to `/kb/default/search?q=notice`, not `/search?q=notice`.
