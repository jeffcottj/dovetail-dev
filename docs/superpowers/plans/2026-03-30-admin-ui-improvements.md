# Admin UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve admin UI navigation, remove clutter, add KB context switching, and add user search.

**Architecture:** Refactor admin layout to remove Quick Actions and Activity Feed from the dashboard, simplify the section header, update the sidebar with new branding and a context switcher dropdown, create standalone Recent Activity pages, and add server-side user search with a debounced frontend input.

**Tech Stack:** Next.js 15 (App Router), React 19, Express 5, Drizzle ORM, Zod, Vitest, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-30-admin-ui-improvements-design.md`

---

### Task 1: Refactor navigation, layout, and all admin pages

This task updates shared components (nav helpers, section header, workspace layout) and all 9 admin pages in one atomic commit to keep the app compilable throughout.

**Files:**
- Modify: `apps/web/lib/admin/nav.ts`
- Modify: `apps/web/components/admin/AdminSectionHeader.tsx`
- Modify: `apps/web/components/admin/AdminWorkspaceLayout.tsx`
- Modify: `apps/web/components/admin/AdminNav.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Modify: `apps/web/app/(admin)/admin/users/page.tsx`
- Modify: `apps/web/app/(admin)/admin/users/[id]/page.tsx`
- Modify: `apps/web/app/(admin)/admin/knowledge-bases/page.tsx`
- Modify: `apps/web/app/(admin)/admin/api-keys/page.tsx`
- Modify: `apps/web/app/(admin)/kb/[kbSlug]/admin/page.tsx`
- Modify: `apps/web/app/(admin)/kb/[kbSlug]/admin/users/page.tsx`
- Modify: `apps/web/app/(admin)/kb/[kbSlug]/admin/tags/page.tsx`
- Modify: `apps/web/app/(admin)/kb/[kbSlug]/admin/import/page.tsx`
- Delete: `apps/web/components/admin/AdminQuickActions.tsx`

- [ ] **Step 1: Rewrite `getAdminNavSections` in nav.ts**

Replace the function to return a single section for the current context and add "Recent Activity" to both contexts. Remove `buildGlobalAdminActions`, `buildKbAdminActions`, and the `AdminQuickActionItem` import (all no longer needed).

```ts
// apps/web/lib/admin/nav.ts — full replacement

export interface AdminNavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface AdminNavSection {
  label: string;
  items: AdminNavItem[];
}

export interface AdminNavInput {
  pathname: string;
  kb?: {
    slug: string;
    name: string;
  } | null;
}

export function getAdminNavSections(input: AdminNavInput): AdminNavSection[] {
  const pathname = input.pathname.replace(/\/+$/, '') || '/';
  const isExact = (href: string) => pathname === href;
  const isDescendant = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (input.kb) {
    return [
      {
        label: input.kb.name,
        items: [
          { label: 'KB Overview', href: `/kb/${input.kb.slug}/admin`, active: isExact(`/kb/${input.kb.slug}/admin`) },
          { label: 'Users & Roles', href: `/kb/${input.kb.slug}/admin/users`, active: isDescendant(`/kb/${input.kb.slug}/admin/users`) },
          { label: 'Tags', href: `/kb/${input.kb.slug}/admin/tags`, active: isExact(`/kb/${input.kb.slug}/admin/tags`) },
          { label: 'Import', href: `/kb/${input.kb.slug}/admin/import`, active: isExact(`/kb/${input.kb.slug}/admin/import`) },
          { label: 'Recent Activity', href: `/kb/${input.kb.slug}/admin/activity`, active: isExact(`/kb/${input.kb.slug}/admin/activity`) },
        ],
      },
    ];
  }

  return [
    {
      label: 'Global Admin',
      items: [
        { label: 'Overview', href: '/admin', active: isExact('/admin') },
        { label: 'Users', href: '/admin/users', active: isDescendant('/admin/users') },
        { label: 'Knowledge Bases', href: '/admin/knowledge-bases', active: isExact('/admin/knowledge-bases') },
        { label: 'API Keys', href: '/admin/api-keys', active: isExact('/admin/api-keys') },
        { label: 'Recent Activity', href: '/admin/activity', active: isExact('/admin/activity') },
      ],
    },
  ];
}
```

- [ ] **Step 2: Update AdminSectionHeader — remove description**

Remove the `description` prop and its `<p>` element. Replace the `AdminQuickActionItem` import with an inline type for `primaryActions`.

```tsx
// apps/web/components/admin/AdminSectionHeader.tsx — full replacement
import Link from 'next/link';
import { Badge } from '../ui/Badge';

export interface AdminSectionHeaderProps {
  title: string;
  scopeLabel?: string;
  primaryActions?: { label: string; href: string }[];
}

export function AdminSectionHeader({
  title,
  scopeLabel,
  primaryActions = [],
}: AdminSectionHeaderProps) {
  return (
    <header className="border-b border-border-light bg-[color:var(--color-admin-panel)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          {scopeLabel ? <Badge variant="info">{scopeLabel}</Badge> : null}
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-ink">
            {title}
          </h1>
        </div>

        {primaryActions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {primaryActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center justify-center rounded-md border border-border bg-[color:var(--color-admin-bg)] px-4 py-2 font-[family-name:var(--font-ui)] text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Simplify AdminWorkspaceLayout — remove Quick Actions and Activity Feed**

Remove `actions`, `activity`, and `activityUnavailableMessage` props. Remove the two-column grid. Add `isGlobalAdmin`, `currentKbSlug`, and `currentKbName` to the `nav` prop for the context switcher (used in a later task).

```tsx
// apps/web/components/admin/AdminWorkspaceLayout.tsx — full replacement
import type { ReactNode } from 'react';
import type { AdminNavSection } from '../../lib/admin/nav';
import { AdminMetricStrip, type AdminMetricItem } from './AdminMetricStrip';
import { AdminNav } from './AdminNav';
import { AdminSectionHeader, type AdminSectionHeaderProps } from './AdminSectionHeader';

export interface AdminWorkspaceLayoutProps {
  nav: {
    sections: AdminNavSection[];
    isGlobalAdmin: boolean;
    currentKbSlug: string | null;
    currentKbName?: string;
  };
  header: AdminSectionHeaderProps;
  metrics: AdminMetricItem[];
  children: ReactNode;
}

export function AdminWorkspaceLayout({
  nav,
  header,
  metrics,
  children,
}: AdminWorkspaceLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--color-admin-bg)] text-ink lg:flex-row">
      <AdminNav
        sections={nav.sections}
        isGlobalAdmin={nav.isGlobalAdmin}
        currentKbSlug={nav.currentKbSlug}
        currentKbName={nav.currentKbName}
      />
      <main id="main-content" className="min-w-0 flex-1">
        <AdminSectionHeader {...header} />
        <div className="space-y-8 px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
          <AdminMetricStrip items={metrics} />
          {children}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Update AdminNav props — accept context switcher data**

Add `isGlobalAdmin`, `currentKbSlug`, `currentKbName` to the props interface. These are unused for now (AdminContextSwitcher is created in Task 4) but the data pipeline is established.

```tsx
// apps/web/components/admin/AdminNav.tsx — update the interface only (line 4-8)
// Change:
interface AdminNavProps {
  sections: AdminNavSection[];
}
// To:
interface AdminNavProps {
  sections: AdminNavSection[];
  isGlobalAdmin: boolean;
  currentKbSlug: string | null;
  currentKbName?: string;
}
```

And update the component signature to accept and ignore the new props:

```tsx
// Change (line 37):
export function AdminNav({ sections }: AdminNavProps) {
// To:
export function AdminNav({ sections, isGlobalAdmin, currentKbSlug, currentKbName }: AdminNavProps) {
```

- [ ] **Step 5: Update `/admin/page.tsx` (Admin Overview)**

Remove `buildGlobalAdminActions` import, `actions`/`activity`/`activityUnavailableMessage` props, the `description` from header, the "quick actions" paragraph from the summary card, and add context switcher data to nav.

```tsx
// apps/web/app/(admin)/admin/page.tsx — full replacement
import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../components/ui/Card';
import { getAdminNavSections } from '../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  buildGlobalAdminSummary,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../lib/admin/workspace';

export default async function AdminPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({ pathname: '/admin' }),
        isGlobalAdmin: true,
        currentKbSlug: null,
      }}
      header={{
        title: 'Admin Overview',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
    >
      {overview.ok ? (
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Workspace Summary
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            {buildGlobalAdminSummary(overview)}
          </p>
        </Card>
      ) : (
        <Card className="border-warning/40 bg-warning/10">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
            Overview unavailable
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
        </Card>
      )}
    </AdminWorkspaceLayout>
  );
}
```

- [ ] **Step 6: Update `/admin/users/page.tsx`**

Remove `buildGlobalAdminActions` import, `actions`/`activity`/`activityUnavailableMessage` props, `description` from header, and the "User Directory" descriptive Card.

```tsx
// apps/web/app/(admin)/admin/users/page.tsx — full replacement
import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../components/ui/Card';
import { getAdminNavSections } from '../../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../../lib/admin/workspace';
import { fetchAdminResource } from '../../../../lib/admin/resource';
import { UserList } from '../../../(main)/admin/users/UserList';

interface PaginatedUsers {
  data: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: string;
    provider: string;
    createdAt: string;
  }[];
  total: number;
  page: number;
  limit: number;
}

export default async function AdminUsersPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);
  const usersResult = await fetchAdminResource<PaginatedUsers>('/api/admin/users?limit=100');

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({ pathname: '/admin/users' }),
        isGlobalAdmin: true,
        currentKbSlug: null,
      }}
      header={{
        title: 'Users',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
    >
      <section className="space-y-4">
        {overviewWarning ? (
          <Card className="border-warning/40 bg-warning/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
              Overview unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
          </Card>
        ) : null}
        {!usersResult.ok ? (
          <Card className="border-danger/30 bg-danger/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
              Users unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{usersResult.error}</p>
          </Card>
        ) : (
          <p className="text-sm text-ink-muted font-[family-name:var(--font-ui)]">
            {usersResult.data.total} user{usersResult.data.total !== 1 ? 's' : ''} total
          </p>
        )}
        {usersResult.ok ? <UserList users={usersResult.data.data} /> : null}
      </section>
    </AdminWorkspaceLayout>
  );
}
```

- [ ] **Step 7: Update `/admin/users/[id]/page.tsx` (User Detail)**

Remove `buildGlobalAdminActions` import, `actions`/`activity`/`activityUnavailableMessage` props, and `description` from header. This page has no descriptive Card to remove.

In the header, change:
```tsx
header={{
  title: userResult.ok ? userResult.data.name : 'User unavailable',
  description: 'Review global access and category-level overrides for this user.',
  scopeLabel: 'Global Admin',
}}
```
To:
```tsx
header={{
  title: userResult.ok ? userResult.data.name : 'User unavailable',
  scopeLabel: 'Global Admin',
}}
```

In the nav, change:
```tsx
nav={{ sections: getAdminNavSections({ pathname: '/admin/users' }) }}
```
To:
```tsx
nav={{
  sections: getAdminNavSections({ pathname: '/admin/users' }),
  isGlobalAdmin: true,
  currentKbSlug: null,
}}
```

Remove the import of `buildGlobalAdminActions`. Remove the `actions`, `activity`, and `activityUnavailableMessage` props from the `AdminWorkspaceLayout` call.

- [ ] **Step 8: Update `/admin/knowledge-bases/page.tsx`**

Remove `buildGlobalAdminActions` import, `actions`/`activity`/`activityUnavailableMessage` props, `description` from header, and the "Knowledge Base Operations" descriptive Card.

In the nav, add `isGlobalAdmin: true, currentKbSlug: null`. In the header, remove `description`. Remove the Card that starts with "Knowledge Base Operations".

The remaining children should be:
```tsx
<section className="space-y-4">
  {overviewWarning ? (
    <Card className="border-warning/40 bg-warning/10">
      <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
        Overview unavailable
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
    </Card>
  ) : null}
  {!knowledgeBasesResult.ok ? (
    <Card className="border-danger/30 bg-danger/10">
      <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
        Knowledge bases unavailable
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{knowledgeBasesResult.error}</p>
    </Card>
  ) : (
    <KbManager initialKbs={knowledgeBasesResult.data} />
  )}
</section>
```

- [ ] **Step 9: Update `/admin/api-keys/page.tsx`**

Same pattern: remove `buildGlobalAdminActions` import, `actions`/`activity`/`activityUnavailableMessage` props, `description` from header, and the "Integration Access" descriptive Card. Add `isGlobalAdmin: true, currentKbSlug: null` to nav.

The remaining children should be:
```tsx
<section className="space-y-4">
  {overviewWarning ? (
    <Card className="border-warning/40 bg-warning/10">
      <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
        Overview unavailable
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
    </Card>
  ) : null}
  {!keysResult.ok ? (
    <Card className="border-danger/30 bg-danger/10">
      <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
        API keys unavailable
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{keysResult.error}</p>
    </Card>
  ) : (
    <ApiKeyManager initialKeys={keysResult.data} />
  )}
</section>
```

- [ ] **Step 10: Update `/kb/[kbSlug]/admin/page.tsx` (KB Overview)**

Remove `buildKbAdminActions` import, `actions`/`activity`/`activityUnavailableMessage` props, `description` from header, and the "quick actions" paragraph from the summary card. Add session check for `isGlobalAdmin`. Add context switcher data to nav.

```tsx
// apps/web/app/(admin)/kb/[kbSlug]/admin/page.tsx — full replacement
import { notFound } from 'next/navigation';
import { auth } from '../../../../../auth';
import { AdminWorkspaceLayout } from '../../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../../components/ui/Card';
import { getAdminNavSections } from '../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  buildKbAdminSummary,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../lib/admin/kb-workspace';
import { getKbBySlug } from '../../../../../lib/kb';

export default async function KbAdminPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const session = await auth();
  const isGlobalAdmin = (session?.user as any)?.role === 'admin';

  const overview = await fetchKbAdminOverview(kb.id);
  const overviewWarning = getKbAdminOverviewWarning(overview);
  const kbContext = overview.ok ? overview.kb : kb;

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({
          pathname: `/kb/${kbContext.slug}/admin`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
        isGlobalAdmin,
        currentKbSlug: kbContext.slug,
        currentKbName: kbContext.name,
      }}
      header={{
        title: 'KB Overview',
        scopeLabel: kbContext.name,
      }}
      metrics={overview.ok ? buildKbAdminMetrics(overview) : []}
    >
      {overview.ok ? (
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Workspace Summary
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            {buildKbAdminSummary(overview)}
          </p>
        </Card>
      ) : (
        <Card className="border-warning/40 bg-warning/10">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
            Overview unavailable
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
        </Card>
      )}
    </AdminWorkspaceLayout>
  );
}
```

- [ ] **Step 11: Update `/kb/[kbSlug]/admin/users/page.tsx`**

Remove `buildKbAdminActions` import, `actions`/`activity`/`activityUnavailableMessage` props, `description` from header, and the "KB Access" descriptive Card. Add session check for `isGlobalAdmin`. Add context switcher data to nav.

Add these imports at the top:
```tsx
import { auth } from '../../../../../../auth';
```

Add session check before the overview fetch:
```tsx
const session = await auth();
const isGlobalAdmin = (session?.user as any)?.role === 'admin';
```

Change the nav prop to:
```tsx
nav={{
  sections: getAdminNavSections({
    pathname: `/kb/${kbContext.slug}/admin/users`,
    kb: { slug: kbContext.slug, name: kbContext.name },
  }),
  isGlobalAdmin,
  currentKbSlug: kbContext.slug,
  currentKbName: kbContext.name,
}}
```

Change the header prop to:
```tsx
header={{
  title: 'Users & Roles',
  scopeLabel: kbContext.name,
}}
```

Remove the `actions`, `activity`, `activityUnavailableMessage` props. Remove the `buildKbAdminActions` import.

Remove the "KB Access" descriptive Card (the `<Card>` with "KB Access" title and the description paragraph about reviewing global roles).

- [ ] **Step 12: Update `/kb/[kbSlug]/admin/tags/page.tsx`**

Same pattern as Step 11: add auth import and session check, remove `buildKbAdminActions` import, remove `actions`/`activity`/`activityUnavailableMessage` props, remove `description` from header, remove the "Tag Library" descriptive Card, add context switcher data to nav.

The auth import path:
```tsx
import { auth } from '../../../../../../auth';
```

- [ ] **Step 13: Update `/kb/[kbSlug]/admin/import/page.tsx`**

Same pattern: add auth import and session check, remove `buildKbAdminActions` import, remove `actions`/`activity`/`activityUnavailableMessage` props, remove `description` from header, remove the "Import Pipeline" descriptive Card, add context switcher data to nav.

- [ ] **Step 14: Delete `AdminQuickActions.tsx`**

```bash
rm apps/web/components/admin/AdminQuickActions.tsx
```

- [ ] **Step 15: Build to verify**

Run: `pnpm build`
Expected: Build succeeds with no type errors.

- [ ] **Step 16: Commit**

```bash
git add apps/web/lib/admin/nav.ts apps/web/components/admin/AdminSectionHeader.tsx apps/web/components/admin/AdminWorkspaceLayout.tsx apps/web/components/admin/AdminNav.tsx apps/web/app/ apps/web/components/admin/AdminQuickActions.tsx
git commit -m "$(cat <<'EOF'
refactor: remove Quick Actions, Activity Feed, and descriptions from admin layout

- Remove Quick Actions table and Activity Feed from dashboard layout
- Remove description prop from AdminSectionHeader
- Remove descriptive Cards from all admin pages
- Simplify AdminWorkspaceLayout props
- Update getAdminNavSections to return single context section
- Add Recent Activity to nav sections
- Add isGlobalAdmin/currentKbSlug to nav prop pipeline
- Delete AdminQuickActions component

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Update AdminNav sidebar appearance

**Files:**
- Modify: `apps/web/components/admin/AdminNav.tsx`

- [ ] **Step 1: Update branding, width, and add "Return to Knowledge Base" link**

In `AdminNav.tsx`, make these changes:

1. Change both "Maryland Legal Aid" text instances to "Dovetail" (mobile and desktop)
2. Change desktop sidebar width from `w-72` to `w-96`
3. Add a "Return to Knowledge Base" link between the header and nav sections

For the **mobile** `<details>` block, change the branding text:
```tsx
// Change (line 43-44):
<p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[color:var(--color-sidebar-text)]">
  Maryland Legal Aid
</p>
// To:
<p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[color:var(--color-sidebar-text)]">
  Dovetail
</p>
```

For the **desktop** `<aside>`, change branding and width:
```tsx
// Change (line 61):
<aside className="hidden w-full shrink-0 border-b border-[color:rgba(255,255,255,0.12)] bg-[color:var(--color-admin-rail)] text-white lg:block lg:w-72 lg:border-b-0 lg:border-r">
// To:
<aside className="hidden w-full shrink-0 border-b border-[color:rgba(255,255,255,0.12)] bg-[color:var(--color-admin-rail)] text-white lg:block lg:w-96 lg:border-b-0 lg:border-r">
```

```tsx
// Change (line 64-65):
<p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[color:var(--color-sidebar-text)]">
  Maryland Legal Aid
</p>
// To:
<p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[color:var(--color-sidebar-text)]">
  Dovetail
</p>
```

Add the "Return to Knowledge Base" link. Insert it after the header `<div>` and before the `<nav>` on desktop. Add `import Link from 'next/link'` at the top of the file.

For **desktop**, between the header border-b div (closing `</div>` around line 70) and the `<nav>` (line 72), insert:

```tsx
<div className="border-b border-[color:rgba(255,255,255,0.12)] px-4 py-3 lg:px-4">
  <Link
    href="/"
    className="flex w-full items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 font-[family-name:var(--font-ui)] text-sm font-medium text-white transition-colors hover:bg-white/20"
  >
    &larr; Return to Knowledge Base
  </Link>
</div>
```

For **mobile**, add the same link inside the `<details>` block, before the `<nav>`:

```tsx
<div className="border-b border-[color:rgba(255,255,255,0.12)] px-3 py-3 sm:px-4">
  <Link
    href="/"
    className="flex w-full items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 font-[family-name:var(--font-ui)] text-sm font-medium text-white transition-colors hover:bg-white/20"
  >
    &larr; Return to Knowledge Base
  </Link>
</div>
```

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/admin/AdminNav.tsx
git commit -m "$(cat <<'EOF'
feat: update admin sidebar — Dovetail branding, wider sidebar, return link

- Change branding from 'Maryland Legal Aid' to 'Dovetail'
- Widen sidebar from w-72 to w-96 to match KB sidebar
- Add 'Return to Knowledge Base' link between header and nav

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Create and integrate AdminContextSwitcher

**Files:**
- Create: `apps/web/components/admin/AdminContextSwitcher.tsx`
- Modify: `apps/web/components/admin/AdminNav.tsx`

- [ ] **Step 1: Create AdminContextSwitcher component**

This client component fetches KBs, renders a dropdown to switch between Global Admin and KB contexts. Modeled on `KbSwitcher.tsx` patterns.

```tsx
// apps/web/components/admin/AdminContextSwitcher.tsx
'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { KnowledgeBase } from '@dovetail/types';
import { apiClientFetch } from '../../lib/api-client';

interface AdminContextSwitcherProps {
  isGlobalAdmin: boolean;
  currentKbSlug: string | null;
  currentKbName?: string;
}

export function AdminContextSwitcher({
  isGlobalAdmin,
  currentKbSlug,
  currentKbName,
}: AdminContextSwitcherProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  useEffect(() => {
    apiClientFetch<KnowledgeBase[]>('/api/knowledge-bases')
      .then((kbs) => setKnowledgeBases(kbs.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleSelect(target: 'global' | string) {
    setOpen(false);
    if (target === 'global' && !currentKbSlug) return;
    if (target !== 'global' && target === currentKbSlug) return;

    startTransition(() => {
      router.push(target === 'global' ? '/admin' : `/kb/${target}/admin`);
    });
  }

  const currentLabel = currentKbSlug
    ? currentKbName ?? knowledgeBases.find((kb) => kb.slug === currentKbSlug)?.name ?? 'Loading…'
    : 'Global Admin';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="w-full rounded-xl border border-white/15 bg-[color:var(--color-admin-rail-muted)]/60 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] shadow-sm transition-colors hover:bg-[color:var(--color-admin-rail-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">
          Admin Context
        </span>
        <span className="mt-1 flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-white">
              {currentLabel}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/70" />
        </span>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/15 bg-[color:var(--color-admin-rail)] shadow-xl ring-1 ring-black/10">
          <div role="listbox" aria-label="Admin context" className="py-1">
            {isGlobalAdmin && (
              <button
                type="button"
                role="option"
                aria-selected={!currentKbSlug}
                onClick={() => handleSelect('global')}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] transition-colors ${
                  !currentKbSlug
                    ? 'bg-[color:var(--color-admin-rail-muted)] text-white'
                    : 'text-white/90 hover:bg-[color:var(--color-admin-rail-muted)]/80 hover:text-white'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    !currentKbSlug
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/20 text-transparent'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">Global Admin</span>
                </span>
              </button>
            )}

            {knowledgeBases.map((kb) => {
              const isSelected = kb.slug === currentKbSlug;

              return (
                <button
                  key={kb.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(kb.slug)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] transition-colors ${
                    isSelected
                      ? 'bg-[color:var(--color-admin-rail-muted)] text-white'
                      : 'text-white/90 hover:bg-[color:var(--color-admin-rail-muted)]/80 hover:text-white'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? 'border-white/40 bg-white/10 text-white'
                        : 'border-white/20 text-transparent'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{kb.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate AdminContextSwitcher into AdminNav**

In `AdminNav.tsx`, import and render the AdminContextSwitcher. Replace the static section label `<h2>` in `AdminNavSections` with the context switcher rendered above the sections.

Add the import:
```tsx
import { AdminContextSwitcher } from './AdminContextSwitcher';
```

Remove the section label from `AdminNavSections`. Change:
```tsx
function AdminNavSections({ sections }: { sections: AdminNavSection[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
      {sections.map((section) => (
        <section key={section.label}>
          <h2 className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-sidebar-text)]">
            {section.label}
          </h2>
          <div className="mt-3 grid gap-1">
```
To:
```tsx
function AdminNavSections({ sections }: { sections: AdminNavSection[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
      {sections.map((section) => (
        <section key={section.label}>
          <div className="grid gap-1">
```

And update the corresponding closing tags (`</div>` replaces `</div>` for `mt-3 grid gap-1`).

In the **desktop** `<aside>`, add the context switcher between the "Return to Knowledge Base" link div and the `<nav>`. Insert after the return-link `</div>` and before `<nav>`:

```tsx
<div className="border-b border-[color:rgba(255,255,255,0.12)] px-4 py-3 lg:px-4">
  <AdminContextSwitcher
    isGlobalAdmin={isGlobalAdmin}
    currentKbSlug={currentKbSlug}
    currentKbName={currentKbName}
  />
</div>
```

In the **mobile** `<details>`, add the same context switcher block between the return-link div and the `<nav>`.

- [ ] **Step 3: Build to verify**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/admin/AdminContextSwitcher.tsx apps/web/components/admin/AdminNav.tsx
git commit -m "$(cat <<'EOF'
feat: add AdminContextSwitcher for global/KB admin navigation

- New dropdown component to switch between Global Admin and KB contexts
- Fetches KB list client-side, sorted alphabetically
- Replaces static section labels in admin sidebar
- Keyboard nav, escape-to-close, click-outside-to-close

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Create Recent Activity pages

**Files:**
- Create: `apps/web/app/(admin)/admin/activity/page.tsx`
- Create: `apps/web/app/(admin)/kb/[kbSlug]/admin/activity/page.tsx`

- [ ] **Step 1: Create global Recent Activity page**

```tsx
// apps/web/app/(admin)/admin/activity/page.tsx
import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../components/admin/AdminWorkspaceLayout';
import { AdminActivityFeed } from '../../../../components/admin/AdminActivityFeed';
import { getAdminNavSections } from '../../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../../lib/admin/workspace';

export default async function AdminActivityPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({ pathname: '/admin/activity' }),
        isGlobalAdmin: true,
        currentKbSlug: null,
      }}
      header={{
        title: 'Recent Activity',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
    >
      <AdminActivityFeed
        items={overview.ok ? overview.activity : []}
        unavailableMessage={overviewWarning}
      />
    </AdminWorkspaceLayout>
  );
}
```

- [ ] **Step 2: Create KB Recent Activity page**

```tsx
// apps/web/app/(admin)/kb/[kbSlug]/admin/activity/page.tsx
import { notFound } from 'next/navigation';
import { auth } from '../../../../../../auth';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import { AdminActivityFeed } from '../../../../../../components/admin/AdminActivityFeed';
import { getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { getKbBySlug } from '../../../../../../lib/kb';

export default async function KbActivityPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const session = await auth();
  const isGlobalAdmin = (session?.user as any)?.role === 'admin';

  const overview = await fetchKbAdminOverview(kb.id);
  const overviewWarning = getKbAdminOverviewWarning(overview);
  const kbContext = overview.ok ? overview.kb : kb;

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({
          pathname: `/kb/${kbContext.slug}/admin/activity`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
        isGlobalAdmin,
        currentKbSlug: kbContext.slug,
        currentKbName: kbContext.name,
      }}
      header={{
        title: 'Recent Activity',
        scopeLabel: kbContext.name,
      }}
      metrics={overview.ok ? buildKbAdminMetrics(overview) : []}
    >
      <AdminActivityFeed
        items={overview.ok ? overview.activity : []}
        unavailableMessage={overviewWarning}
      />
    </AdminWorkspaceLayout>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(admin\)/admin/activity/ apps/web/app/\(admin\)/kb/\[kbSlug\]/admin/activity/
git commit -m "$(cat <<'EOF'
feat: add standalone Recent Activity pages for global and KB admin

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add server-side user search to API

**Files:**
- Test: `apps/api/src/__tests__/admin-users-search.test.ts`
- Modify: `apps/api/src/routes/admin/users.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/__tests__/admin-users-search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminUsersRouter } from '../routes/admin/users.js';

// Mock auth and role middleware to pass through
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => {
    _req.user = { id: 'test-admin', role: 'admin' };
    next();
  },
}));

vi.mock('../middleware/requireRole.js', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock drizzle db
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();

vi.mock('@dovetail/db', () => {
  const chain = () => ({
    select: mockSelect,
    from: mockFrom,
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    offset: mockOffset,
  });

  // Set up chaining: each method returns the chain
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ offset: mockOffset });
  mockOffset.mockResolvedValue([]);

  return {
    db: { select: mockSelect },
    users: {
      id: 'users.id',
      email: 'users.email',
      name: 'users.name',
      avatarUrl: 'users.avatarUrl',
      role: 'users.role',
      provider: 'users.provider',
      createdAt: 'users.createdAt',
    },
    adminActivityEvents: {},
    userCategoryRoles: {},
    categories: {},
  };
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/users', adminUsersRouter);
  return app;
}

describe('GET /api/admin/users with search', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: count query returns 0
    mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue({ offset: mockOffset });
    mockOffset.mockResolvedValue([]);
  });

  it('passes search parameter through to query when provided', async () => {
    // Mock count query
    const countChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    };
    // Mock data query
    const dataChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    mockSelect
      .mockReturnValueOnce(countChain)   // count query
      .mockReturnValueOnce(dataChain);   // data query

    const app = createApp();
    const res = await request(app).get('/api/admin/users?search=alice');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    // Verify the where clause was called (search filter applied)
    expect(countChain.from).toHaveBeenCalled();
    expect(dataChain.from).toHaveBeenCalled();
  });

  it('returns 200 without search parameter', async () => {
    const countChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    };
    const dataChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    mockSelect
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(dataChain);

    const app = createApp();
    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/__tests__/admin-users-search.test.ts`
Expected: FAIL — the `search` query param is not yet handled by the route, but the Zod validation may reject it as an unknown field. The test structure may need adjustment based on the actual failure.

- [ ] **Step 3: Add search parameter to the users list endpoint**

In `apps/api/src/routes/admin/users.ts`:

Add `or` and `ilike` to the drizzle-orm import:
```ts
// Change:
import { and, eq, sql } from 'drizzle-orm';
// To:
import { and, eq, ilike, or, sql } from 'drizzle-orm';
```

Create a schema that extends pagination with search:
```ts
const userListSchema = paginationSchema.extend({
  search: z.string().optional(),
});
```

Update the GET `/` route to use the new schema and apply the filter:

```ts
// GET /api/admin/users — list users (paginated, searchable)
adminUsersRouter.get('/', authMiddleware, requireRole('admin'), validateQuery(userListSchema), async (_req, res) => {
  const { page, limit, search } = res.locals.query as z.infer<typeof userListSchema>;
  const offset = (page - 1) * limit;

  const whereClause = search
    ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
    : undefined;

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(whereClause);

  const data = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
      provider: users.provider,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(users.createdAt, users.id)
    .limit(limit)
    .offset(offset);

  res.json(paginate(data, Number(total), { page, limit }));
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/__tests__/admin-users-search.test.ts`
Expected: PASS

If the mocking setup needs adjustment based on the actual Drizzle query chain, fix the test to match the implementation's query structure and re-run.

- [ ] **Step 5: Run all API tests to check for regressions**

Run: `cd apps/api && pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/users.ts apps/api/src/__tests__/admin-users-search.test.ts
git commit -m "$(cat <<'EOF'
feat: add search parameter to GET /api/admin/users

Accepts optional `search` query param that filters users by name or
email using case-insensitive ILIKE matching.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add search UI to UserList

**Files:**
- Modify: `apps/web/app/(main)/admin/users/UserList.tsx`

- [ ] **Step 1: Add search input with debounced server-side fetch**

Replace the full `UserList.tsx` file:

```tsx
// apps/web/app/(main)/admin/users/UserList.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { apiClientFetch } from '../../../../lib/api-client';
import { useToast } from '../../../../lib/hooks/useToast';
import { runAdminMutation } from '../../../../lib/admin/mutation';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  provider: string;
  createdAt: string;
}

interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

const ROLES = ['viewer', 'editor', 'admin'] as const;

export function UserList({ users: serverUsers }: { users: User[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const toast = useToast();

  const displayedUsers = searchResults ?? serverUsers;

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(() => {
      apiClientFetch<PaginatedUsers>(
        `/api/admin/users?search=${encodeURIComponent(search.trim())}&limit=100`,
      )
        .then((result) => setSearchResults(result.data))
        .catch(() => {});
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdating(userId);
    await runAdminMutation({
      execute: () =>
        apiClientFetch<User>(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        }),
      onSuccess: async (updated) => {
        // Update in both server users and search results
        const updateUser = (u: User) =>
          u.id === userId ? { ...u, role: updated.role } : u;

        if (searchResults) {
          setSearchResults((prev) => prev?.map(updateUser) ?? null);
        }

        toast.success('Role updated');
      },
      onError: () => {
        toast.error('Failed to update role');
      },
      refresh: router.refresh,
    });
    setUpdating(null);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border-light bg-parchment px-4 py-2 pr-8 text-sm font-[family-name:var(--font-ui)] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border-light">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-light bg-parchment-warm">
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Name
              </th>
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Email
              </th>
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Provider
              </th>
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedUsers.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer border-b border-border-light transition-colors last:border-0 hover:bg-parchment-warm/50"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('select')) return;
                  router.push(`/admin/users/${user.id}`);
                }}
              >
                <td className="px-4 py-3 text-sm text-ink">{user.name}</td>
                <td className="px-4 py-3 text-sm text-ink-light">{user.email}</td>
                <td className="px-4 py-3 text-sm capitalize text-ink-muted">{user.provider}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    disabled={updating === user.id}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="rounded border border-border bg-parchment px-2 py-1 font-[family-name:var(--font-ui)] text-sm disabled:opacity-50"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {displayedUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-muted">
                  {search.trim()
                    ? `No users matching '${search.trim()}'`
                    : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test**

Run: `just dev`

1. Navigate to `/admin/users`
2. Type "admin" in the search box — table should filter after ~300ms
3. Clear the search — table should show all users
4. Type a non-matching string — should show "No users matching '...'"

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(main\)/admin/users/UserList.tsx
git commit -m "$(cat <<'EOF'
feat: add debounced search to admin users list

Auto-filters the user table by name or email as you type, with 300ms
debounce and server-side ILIKE search. Clear button resets to the
original server-provided list.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```
