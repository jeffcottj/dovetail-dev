# Admin Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated admin workspace for global and KB-scoped admin routes, with shared navigation, metric summaries, quick actions, and a recent activity feed.

**Architecture:** Move admin routes into a dedicated Next.js route group so they are no longer trapped inside the reader-facing `(main)` and KB content sidebars. Back the new shell with two overview endpoints: one global and one KB-scoped. Add a lightweight `admin_activity_events` table plus route-level event writers for mutations that do not currently preserve actor-plus-timestamp history.

**Tech Stack:** Next.js 15 App Router, React 19, Express 5, Drizzle, PostgreSQL, Vitest, Tailwind CSS 4

---

## File Structure

### Create

- `packages/db/migrations/0006_add_admin_activity_events.sql`
- `apps/api/src/routes/admin/overview.ts`
- `apps/api/src/routes/admin/kb-overview.ts`
- `apps/api/src/services/admin-activity.ts`
- `apps/api/src/__tests__/routes/admin/overview.test.ts`
- `apps/api/src/__tests__/routes/admin/kb-overview.test.ts`
- `apps/api/src/__tests__/services/admin-activity.test.ts`
- `apps/web/components/admin/AdminWorkspaceLayout.tsx`
- `apps/web/components/admin/AdminNav.tsx`
- `apps/web/components/admin/AdminSectionHeader.tsx`
- `apps/web/components/admin/AdminMetricStrip.tsx`
- `apps/web/components/admin/AdminQuickActions.tsx`
- `apps/web/components/admin/AdminActivityFeed.tsx`
- `apps/web/lib/admin/nav.ts`
- `apps/web/lib/admin/format.ts`
- `apps/web/lib/admin/nav.test.ts`
- `apps/web/lib/admin/format.test.ts`
- `apps/web/app/(admin)/layout.tsx`
- `apps/web/app/(admin)/admin/page.tsx`
- `apps/web/app/(admin)/admin/users/page.tsx`
- `apps/web/app/(admin)/admin/users/[id]/page.tsx`
- `apps/web/app/(admin)/admin/api-keys/page.tsx`
- `apps/web/app/(admin)/admin/knowledge-bases/page.tsx`
- `apps/web/app/(admin)/kb/[kbSlug]/admin/layout.tsx`
- `apps/web/app/(admin)/kb/[kbSlug]/admin/page.tsx`
- `apps/web/app/(admin)/kb/[kbSlug]/admin/users/page.tsx`
- `apps/web/app/(admin)/kb/[kbSlug]/admin/tags/page.tsx`
- `apps/web/app/(admin)/kb/[kbSlug]/admin/import/page.tsx`

### Modify

- `packages/db/src/schema.ts`
- `packages/types/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/admin/users.ts`
- `apps/api/src/routes/admin/api-keys.ts`
- `apps/api/src/routes/knowledge-bases.ts`
- `apps/api/src/routes/articles.ts`
- `apps/api/src/routes/admin/import.ts`
- `apps/api/src/__tests__/routes/admin/users.test.ts`
- `apps/api/src/__tests__/routes/admin/api-keys.test.ts`
- `apps/api/src/__tests__/routes/knowledge-bases.test.ts`
- `apps/api/src/__tests__/routes/articles.test.ts`
- `apps/api/src/__tests__/routes/admin/import.test.ts`
- `apps/web/app/globals.css`
- `apps/web/app/(main)/admin/page.tsx`
- `apps/web/app/(main)/admin/users/page.tsx`
- `apps/web/app/(main)/admin/users/[id]/page.tsx`
- `apps/web/app/(main)/admin/api-keys/page.tsx`
- `apps/web/app/(main)/admin/knowledge-bases/page.tsx`
- `apps/web/app/(main)/kb/[kbSlug]/admin/page.tsx`
- `apps/web/app/(main)/kb/[kbSlug]/admin/users/page.tsx`
- `apps/web/app/(main)/kb/[kbSlug]/admin/tags/page.tsx`
- `apps/web/app/(main)/kb/[kbSlug]/admin/import/page.tsx`

### Responsibilities

- `admin_activity_events` stores actor-plus-timestamp admin events that cannot be reconstructed later from current tables, especially role changes, revocations, and deletes.
- API overview routes return normalized shell data: metrics, quick-action metadata, and recent activity.
- Web admin components render the shared MLA-constrained ops console shell.
- The new `(admin)` route group provides a dedicated workspace without the existing reader-facing sidebars.

---

### Task 1: Add Admin Activity Contracts And Persistence

**Files:**
- Create: `apps/api/src/services/admin-activity.ts`
- Create: `apps/api/src/__tests__/services/admin-activity.test.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/migrations/0006_add_admin_activity_events.sql`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the failing service test**

```ts
import { describe, expect, it } from 'vitest';
import { buildAdminActivityInsert, normalizeAdminActivityRow } from '../../../services/admin-activity.js';

describe('admin activity helpers', () => {
  it('builds an insert payload with KB context when present', () => {
    const payload = buildAdminActivityInsert({
      kind: 'api_key.revoked',
      actorId: 'user-1',
      knowledgeBaseId: 'kb-1',
      subjectId: 'key-1',
      subjectLabel: 'LibreChat Prod',
      metadata: { revokedAt: '2026-03-28T12:00:00.000Z' },
    });

    expect(payload.kind).toBe('api_key.revoked');
    expect(payload.actorId).toBe('user-1');
    expect(payload.knowledgeBaseId).toBe('kb-1');
  });

  it('normalizes a joined row into the shared response shape', () => {
    const item = normalizeAdminActivityRow({
      id: 'evt-1',
      kind: 'article.edited',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
      actorId: 'user-1',
      actorName: 'Maya Chen',
      actorEmail: 'maya@example.com',
      knowledgeBaseId: 'kb-1',
      knowledgeBaseName: 'Housing',
      subjectId: 'article-1',
      subjectLabel: 'Tenant Eviction Timeline',
      metadata: { articleId: 'article-1' },
    });

    expect(item.actor.name).toBe('Maya Chen');
    expect(item.knowledgeBase?.name).toBe('Housing');
    expect(item.subject.label).toBe('Tenant Eviction Timeline');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @dovetail/api test -- src/__tests__/services/admin-activity.test.ts`

Expected: FAIL with missing `admin-activity.ts` exports and missing shared admin types.

- [ ] **Step 3: Add the shared database and response contracts**

```ts
export type AdminActivityKind =
  | 'user.created'
  | 'user.deleted'
  | 'user.role_changed'
  | 'kb.created'
  | 'kb.deleted'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'article.created'
  | 'article.edited';

export interface AdminActivityItem {
  id: string;
  kind: AdminActivityKind;
  createdAt: string;
  actor: { id: string; name: string; email: string };
  knowledgeBase?: { id: string; name: string } | null;
  subject: { id: string; label: string };
  metadata: Record<string, unknown>;
}
```

```ts
export const adminActivityEvents = pgTable('admin_activity_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  actorId: uuid('actor_id').notNull().references(() => users.id),
  knowledgeBaseId: uuid('knowledge_base_id').references(() => knowledgeBases.id, { onDelete: 'set null' }),
  subjectId: text('subject_id').notNull(),
  subjectLabel: text('subject_label').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

```sql
CREATE TABLE admin_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  knowledge_base_id uuid REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  subject_id text NOT NULL,
  subject_label text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Implement the helper service**

```ts
export function buildAdminActivityInsert(input: BuildAdminActivityInput) {
  return {
    kind: input.kind,
    actorId: input.actorId,
    knowledgeBaseId: input.knowledgeBaseId ?? null,
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel,
    metadata: input.metadata ?? {},
  };
}

export function normalizeAdminActivityRow(row: AdminActivityRow): AdminActivityItem {
  return {
    id: row.id,
    kind: row.kind as AdminActivityKind,
    createdAt: row.createdAt.toISOString(),
    actor: {
      id: row.actorId,
      name: row.actorName,
      email: row.actorEmail,
    },
    knowledgeBase: row.knowledgeBaseId && row.knowledgeBaseName
      ? { id: row.knowledgeBaseId, name: row.knowledgeBaseName }
      : null,
    subject: { id: row.subjectId, label: row.subjectLabel },
    metadata: row.metadata ?? {},
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @dovetail/api test -- src/__tests__/services/admin-activity.test.ts`

Expected: PASS with 2 passing tests.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/0006_add_admin_activity_events.sql packages/types/src/index.ts apps/api/src/services/admin-activity.ts apps/api/src/__tests__/services/admin-activity.test.ts
git commit -m "feat: add admin activity contracts and persistence"
```

### Task 2: Instrument Existing Mutations To Record Admin Activity

**Files:**
- Modify: `apps/api/src/routes/admin/users.ts`
- Modify: `apps/api/src/routes/admin/api-keys.ts`
- Modify: `apps/api/src/routes/knowledge-bases.ts`
- Modify: `apps/api/src/routes/articles.ts`
- Modify: `apps/api/src/routes/admin/import.ts`
- Modify: `apps/api/src/__tests__/routes/admin/users.test.ts`
- Modify: `apps/api/src/__tests__/routes/admin/api-keys.test.ts`
- Modify: `apps/api/src/__tests__/routes/knowledge-bases.test.ts`
- Modify: `apps/api/src/__tests__/routes/articles.test.ts`
- Modify: `apps/api/src/__tests__/routes/admin/import.test.ts`

- [ ] **Step 1: Extend the existing route tests with failing activity assertions**

```ts
it('records a user.role_changed event when a global role changes', async () => {
  const updated = { id: 'u1', email: 'a@b.com', name: 'Alice', role: 'editor', provider: 'google', createdAt: new Date() };
  (db.update as Mock).mockReturnValueOnce(createChain([updated]));
  (db.insert as Mock).mockReturnValueOnce(createChain([{ id: 'evt-1' }]));

  const res = await supertest(app)
    .patch('/api/admin/users/u1')
    .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
    .send({ role: 'editor' });

  expect(res.status).toBe(200);
  expect(db.insert).toHaveBeenCalled();
});
```

```ts
it('records api_key.revoked when an active key is revoked', async () => {
  (db.select as Mock).mockReturnValueOnce(createChain([{
    id: KEY_ID,
    name: 'Test Key',
    keyHash: 'hash',
    createdBy: 'admin-1',
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  }]));
  (db.update as Mock).mockReturnValueOnce(createChain([]));
  (db.insert as Mock).mockReturnValueOnce(createChain([{ id: 'evt-2' }]));

  const res = await supertest(app)
    .delete(`/api/admin/api-keys/${KEY_ID}`)
    .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

  expect(res.status).toBe(200);
  expect(db.insert).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused route tests to verify they fail**

Run: `pnpm --filter @dovetail/api test -- src/__tests__/routes/admin/users.test.ts src/__tests__/routes/admin/api-keys.test.ts src/__tests__/routes/knowledge-bases.test.ts src/__tests__/routes/articles.test.ts src/__tests__/routes/admin/import.test.ts`

Expected: FAIL because the mutation routes do not yet call the admin activity writer.

- [ ] **Step 3: Add the event writes to each mutation route**

```ts
await db.insert(adminActivityEvents).values(buildAdminActivityInsert({
  kind: 'user.role_changed',
  actorId: req.user!.id,
  subjectId: updated.id,
  subjectLabel: updated.name,
  metadata: { role: updated.role },
}));
```

```ts
await db.insert(adminActivityEvents).values(buildAdminActivityInsert({
  kind: 'kb.created',
  actorId: req.user!.id,
  knowledgeBaseId: created.id,
  subjectId: created.id,
  subjectLabel: created.name,
}));
```

```ts
await db.insert(adminActivityEvents).values(buildAdminActivityInsert({
  kind: 'article.edited',
  actorId: req.user!.id,
  knowledgeBaseId: cat?.knowledgeBaseId,
  subjectId: updated.id,
  subjectLabel: updated.title,
  metadata: { articleId: updated.id },
}));
```

Use the same pattern for:

- `api_key.created`
- `api_key.revoked`
- `article.created`
- `kb.deleted`

Do not add an event write for `user.deleted` yet because there is no delete route in the current codebase. Keep the union type ready for that future mutation.

- [ ] **Step 4: Rerun the focused route tests**

Run: `pnpm --filter @dovetail/api test -- src/__tests__/routes/admin/users.test.ts src/__tests__/routes/admin/api-keys.test.ts src/__tests__/routes/knowledge-bases.test.ts src/__tests__/routes/articles.test.ts src/__tests__/routes/admin/import.test.ts`

Expected: PASS with the updated assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/users.ts apps/api/src/routes/admin/api-keys.ts apps/api/src/routes/knowledge-bases.ts apps/api/src/routes/articles.ts apps/api/src/routes/admin/import.ts apps/api/src/__tests__/routes/admin/users.test.ts apps/api/src/__tests__/routes/admin/api-keys.test.ts apps/api/src/__tests__/routes/knowledge-bases.test.ts apps/api/src/__tests__/routes/articles.test.ts apps/api/src/__tests__/routes/admin/import.test.ts
git commit -m "feat: record admin activity from mutations"
```

### Task 3: Expose Global And KB Overview Endpoints

**Files:**
- Create: `apps/api/src/routes/admin/overview.ts`
- Create: `apps/api/src/routes/admin/kb-overview.ts`
- Create: `apps/api/src/__tests__/routes/admin/overview.test.ts`
- Create: `apps/api/src/__tests__/routes/admin/kb-overview.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing route tests**

```ts
it('returns global admin metrics and recent activity', async () => {
  (db.select as Mock)
    .mockReturnValueOnce(createChain([{ count: 12 }]))  // users
    .mockReturnValueOnce(createChain([{ role: 'admin' }, { role: 'viewer' }]))  // role mix
    .mockReturnValueOnce(createChain([{ count: 4 }]))   // KBs
    .mockReturnValueOnce(createChain([{ count: 3 }]))   // active keys
    .mockReturnValueOnce(createChain([{ count: 2 }]))   // revoked keys
  (db.execute as Mock).mockResolvedValueOnce([
    {
      id: 'evt-1',
      kind: 'article.edited',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
      actorId: 'user-1',
      actorName: 'Maya Chen',
      actorEmail: 'maya@example.com',
      knowledgeBaseId: 'kb-1',
      knowledgeBaseName: 'Housing',
      subjectId: 'article-1',
      subjectLabel: 'Tenant Eviction Timeline',
      metadata: {},
    },
  ]);

  const res = await supertest(app)
    .get('/api/admin/overview')
    .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body.metrics.users.total).toBe(12);
  expect(res.body.activity[0].kind).toBe('article.edited');
});
```

```ts
it('returns KB-scoped metrics and KB-scoped activity', async () => {
  (db.select as Mock).mockReturnValueOnce(createChain([{ id: 'kb-1', name: 'Housing', slug: 'housing', description: null, createdAt: new Date() }]));
  (db.select as Mock).mockReturnValueOnce(createChain([{ count: 5 }]));
  (db.select as Mock).mockReturnValueOnce(createChain([{ count: 9 }]));
  (db.select as Mock).mockReturnValueOnce(createChain([{ count: 2 }]));
  (db.select as Mock).mockReturnValueOnce(createChain([{ count: 14 }]));
  (db.execute as Mock).mockResolvedValueOnce([
    {
      id: 'evt-2',
      kind: 'article.created',
      createdAt: new Date(),
      actorId: 'user-2',
      actorName: 'Sam Patel',
      actorEmail: 'sam@example.com',
      knowledgeBaseId: 'kb-1',
      knowledgeBaseName: 'Housing',
      subjectId: 'article-2',
      subjectLabel: 'Rent Escrow Basics',
      metadata: {},
    },
  ]);

  const res = await supertest(app)
    .get('/api/knowledge-bases/kb-1/admin/overview')
    .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body.metrics.tags.total).toBe(9);
  expect(res.body.activity[0].knowledgeBase.name).toBe('Housing');
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `pnpm --filter @dovetail/api test -- src/__tests__/routes/admin/overview.test.ts src/__tests__/routes/admin/kb-overview.test.ts`

Expected: FAIL because the routes are not mounted.

- [ ] **Step 3: Implement the overview routes and mount them**

```ts
overviewRouter.get('/', authMiddleware, requireRole('admin'), async (_req, res) => {
  const metrics = await getGlobalAdminMetrics();
  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.kind,
      e.created_at AS "createdAt",
      e.actor_id AS "actorId",
      u.name AS "actorName",
      u.email AS "actorEmail",
      e.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      e.subject_id AS "subjectId",
      e.subject_label AS "subjectLabel",
      e.metadata
    FROM admin_activity_events e
    INNER JOIN users u ON u.id = e.actor_id
    LEFT JOIN knowledge_bases kb ON kb.id = e.knowledge_base_id
    ORDER BY e.created_at DESC
    LIMIT 20
  `);
  res.json({
    metrics,
    activity: rows.map(normalizeAdminActivityRow),
  });
});
```

```ts
kbOverviewRouter.get('/', authMiddleware, resolveKb, requireKbAdmin, async (req, res) => {
  const kbId = req.params.kbId as string;
  const metrics = await getKbAdminMetrics(kbId);
  const rows = await db.execute(sql`
    SELECT
      e.id,
      e.kind,
      e.created_at AS "createdAt",
      e.actor_id AS "actorId",
      u.name AS "actorName",
      u.email AS "actorEmail",
      e.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      e.subject_id AS "subjectId",
      e.subject_label AS "subjectLabel",
      e.metadata
    FROM admin_activity_events e
    INNER JOIN users u ON u.id = e.actor_id
    LEFT JOIN knowledge_bases kb ON kb.id = e.knowledge_base_id
    WHERE e.knowledge_base_id = ${kbId}
    ORDER BY e.created_at DESC
    LIMIT 20
  `);
  res.json({
    metrics,
    activity: rows.map(normalizeAdminActivityRow),
  });
});
```

```ts
app.use('/api/admin/overview', overviewRouter);
app.use('/api/knowledge-bases/:kbId/admin/overview', resolveKb, kbOverviewRouter);
```

- [ ] **Step 4: Rerun the overview route tests**

Run: `pnpm --filter @dovetail/api test -- src/__tests__/routes/admin/overview.test.ts src/__tests__/routes/admin/kb-overview.test.ts`

Expected: PASS with both route contracts returning the shell data shape.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/admin/overview.ts apps/api/src/routes/admin/kb-overview.ts apps/api/src/app.ts apps/api/src/__tests__/routes/admin/overview.test.ts apps/api/src/__tests__/routes/admin/kb-overview.test.ts
git commit -m "feat: add admin overview endpoints"
```

### Task 4: Build The Dedicated Admin Route Group And Shared Web Shell

**Files:**
- Create: `apps/web/components/admin/AdminWorkspaceLayout.tsx`
- Create: `apps/web/components/admin/AdminNav.tsx`
- Create: `apps/web/components/admin/AdminSectionHeader.tsx`
- Create: `apps/web/components/admin/AdminMetricStrip.tsx`
- Create: `apps/web/components/admin/AdminQuickActions.tsx`
- Create: `apps/web/components/admin/AdminActivityFeed.tsx`
- Create: `apps/web/lib/admin/nav.ts`
- Create: `apps/web/lib/admin/format.ts`
- Create: `apps/web/lib/admin/nav.test.ts`
- Create: `apps/web/lib/admin/format.test.ts`
- Create: `apps/web/app/(admin)/layout.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { describe, expect, it } from 'vitest';
import { getAdminNavSections } from './nav';

describe('getAdminNavSections', () => {
  it('returns global and KB sections when a KB context is present', () => {
    const sections = getAdminNavSections({
      pathname: '/kb/housing/admin/users',
      kb: { slug: 'housing', name: 'Housing' },
    });

    expect(sections).toHaveLength(2);
    expect(sections[1].items[0].href).toBe('/kb/housing/admin');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { formatAdminActivityLine } from './format';

describe('formatAdminActivityLine', () => {
  it('formats role change activity with actor and subject labels', () => {
    const line = formatAdminActivityLine({
      kind: 'user.role_changed',
      actor: { id: 'u1', name: 'Jane Smith', email: 'jane@example.com' },
      subject: { id: 'u2', label: 'Alex Lee' },
      createdAt: '2026-03-28T12:00:00.000Z',
      metadata: { role: 'admin' },
    });

    expect(line).toContain('Jane Smith');
    expect(line).toContain('Alex Lee');
    expect(line).toContain('admin');
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `pnpm --filter @dovetail/web test`

Expected: FAIL with missing `apps/web/lib/admin/nav.ts` and `apps/web/lib/admin/format.ts`.

- [ ] **Step 3: Implement the admin shell helpers and components**

```ts
export function getAdminNavSections(input: AdminNavInput) {
  const globalItems = [
    { label: 'Overview', href: '/admin' },
    { label: 'Users', href: '/admin/users' },
    { label: 'Knowledge Bases', href: '/admin/knowledge-bases' },
    { label: 'API Keys', href: '/admin/api-keys' },
  ];

  const kbItems = input.kb ? [
    { label: 'KB Overview', href: `/kb/${input.kb.slug}/admin` },
    { label: 'Users & Roles', href: `/kb/${input.kb.slug}/admin/users` },
    { label: 'Tags', href: `/kb/${input.kb.slug}/admin/tags` },
    { label: 'Import', href: `/kb/${input.kb.slug}/admin/import` },
  ] : [];

  return [
    { label: 'Global Admin', items: globalItems },
    ...(kbItems.length > 0 ? [{ label: input.kb!.name, items: kbItems }] : []),
  ];
}
```

```tsx
export function AdminWorkspaceLayout({ nav, header, metrics, actions, activity, children }: AdminWorkspaceLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[color:var(--color-admin-bg)] text-ink">
      <AdminNav sections={nav.sections} />
      <div className="flex-1 min-w-0">
        <AdminSectionHeader {...header} />
        <div className="px-8 pb-8 space-y-8">
          <AdminMetricStrip items={metrics} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <AdminQuickActions items={actions} />
            <AdminActivityFeed items={activity} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
```

```tsx
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      {children}
    </div>
  );
}
```

Add MLA-constrained admin tokens in `globals.css` for darker structural surfaces:

```css
--color-admin-bg: #f4f7fb;
--color-admin-rail: #094A6B;
--color-admin-rail-muted: #0b5a82;
--color-admin-panel: #ffffff;
```

- [ ] **Step 4: Rerun the web tests**

Run: `pnpm --filter @dovetail/web test`

Expected: PASS with the new helper tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/admin apps/web/lib/admin apps/web/app/(admin)/layout.tsx apps/web/app/globals.css
git commit -m "feat: add shared admin workspace shell"
```

### Task 5: Move And Refactor Global Admin Pages Into The New Shell

**Files:**
- Create: `apps/web/app/(admin)/admin/page.tsx`
- Create: `apps/web/app/(admin)/admin/users/page.tsx`
- Create: `apps/web/app/(admin)/admin/users/[id]/page.tsx`
- Create: `apps/web/app/(admin)/admin/api-keys/page.tsx`
- Create: `apps/web/app/(admin)/admin/knowledge-bases/page.tsx`
- Modify: `apps/web/app/(main)/admin/page.tsx`
- Modify: `apps/web/app/(main)/admin/users/page.tsx`
- Modify: `apps/web/app/(main)/admin/users/[id]/page.tsx`
- Modify: `apps/web/app/(main)/admin/api-keys/page.tsx`
- Modify: `apps/web/app/(main)/admin/knowledge-bases/page.tsx`

- [ ] **Step 1: Write the failing helper coverage for global header/action formatting**

```ts
import { describe, expect, it } from 'vitest';
import { buildGlobalAdminActions } from './nav';

describe('buildGlobalAdminActions', () => {
  it('returns task-first shortcuts for the global admin workspace', () => {
    expect(buildGlobalAdminActions()).toEqual([
      expect.objectContaining({ label: 'Create Knowledge Base', href: '/admin/knowledge-bases' }),
      expect.objectContaining({ label: 'Manage Users', href: '/admin/users' }),
      expect.objectContaining({ label: 'Create API Key', href: '/admin/api-keys' }),
    ]);
  });
});
```

- [ ] **Step 2: Run the web tests to verify the new helper coverage fails**

Run: `pnpm --filter @dovetail/web test`

Expected: FAIL because `buildGlobalAdminActions` is not exported yet.

- [ ] **Step 3: Move the pages into the `(admin)` route group and wire them to `/api/admin/overview`**

```tsx
const overview = await apiFetch<AdminOverviewResponse>('/api/admin/overview');

return (
  <AdminWorkspaceLayout
    nav={{ sections: getAdminNavSections({ pathname: '/admin' }) }}
    header={{
      title: 'Admin Overview',
      description: 'System-wide operations, access control, and knowledge-base management.',
      primaryActions: buildGlobalAdminActions(),
    }}
    metrics={overview.metricsCards}
    actions={buildGlobalAdminActions()}
    activity={overview.activity}
  >
    <Card>{/* existing manager or summary body */}</Card>
  </AdminWorkspaceLayout>
);
```

After the new pages are in place, delete the old `(main)` admin route files so the URLs resolve to the new group cleanly.

- [ ] **Step 4: Verify the global routes render and typecheck**

Run: `pnpm --filter @dovetail/web test`

Run: `pnpm --filter @dovetail/web build`

Expected: tests PASS and the Next.js build completes without duplicate-route or type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(admin)/admin apps/web/app/(main)/admin
git commit -m "feat: migrate global admin pages to admin workspace"
```

### Task 6: Move And Refactor KB Admin Pages Into The New Shell

**Files:**
- Create: `apps/web/app/(admin)/kb/[kbSlug]/admin/layout.tsx`
- Create: `apps/web/app/(admin)/kb/[kbSlug]/admin/page.tsx`
- Create: `apps/web/app/(admin)/kb/[kbSlug]/admin/users/page.tsx`
- Create: `apps/web/app/(admin)/kb/[kbSlug]/admin/tags/page.tsx`
- Create: `apps/web/app/(admin)/kb/[kbSlug]/admin/import/page.tsx`
- Modify: `apps/web/app/(main)/kb/[kbSlug]/admin/page.tsx`
- Modify: `apps/web/app/(main)/kb/[kbSlug]/admin/users/page.tsx`
- Modify: `apps/web/app/(main)/kb/[kbSlug]/admin/tags/page.tsx`
- Modify: `apps/web/app/(main)/kb/[kbSlug]/admin/import/page.tsx`

- [ ] **Step 1: Write the failing KB-shell helper coverage**

```ts
import { describe, expect, it } from 'vitest';
import { buildKbAdminActions } from './nav';

describe('buildKbAdminActions', () => {
  it('returns KB-scoped shortcuts with the current slug embedded', () => {
    const actions = buildKbAdminActions({ slug: 'housing' });

    expect(actions[0].href).toBe('/kb/housing/admin/users');
    expect(actions[2].href).toBe('/kb/housing/admin/import');
  });
});
```

- [ ] **Step 2: Run the web tests to verify it fails**

Run: `pnpm --filter @dovetail/web test`

Expected: FAIL because the KB-specific action builder is missing.

- [ ] **Step 3: Move the KB admin pages into the new route group and wire them to `/api/knowledge-bases/:kbId/admin/overview`**

```tsx
const kb = await getKbBySlug(kbSlug);
if (!kb) notFound();

const overview = await apiFetch<KbAdminOverviewResponse>(`/api/knowledge-bases/${kb.id}/admin/overview`);

return (
  <AdminWorkspaceLayout
    nav={{ sections: getAdminNavSections({ pathname: `/kb/${kb.slug}/admin`, kb }) }}
    header={{
      title: `${kb.name} Admin`,
      description: `Operations for /${kb.slug}`,
      scopeLabel: 'Knowledge Base Admin',
      primaryActions: buildKbAdminActions(kb),
    }}
    metrics={overview.metricsCards}
    actions={buildKbAdminActions(kb)}
    activity={overview.activity}
  >
    <KbUserManager users={users} kbId={kb.id} />
  </AdminWorkspaceLayout>
);
```

Use the same shell pattern for:

- KB overview
- KB users
- KB tags
- KB import

After the new pages are in place, delete the old `(main)` KB-admin route files to avoid duplicate URLs.

- [ ] **Step 4: Verify KB admin routes**

Run: `pnpm --filter @dovetail/web test`

Run: `pnpm --filter @dovetail/web build`

Expected: PASS with no duplicate-route errors and KB admin pages compiling against the new shell.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(admin)/kb apps/web/app/(main)/kb
git commit -m "feat: migrate KB admin pages to admin workspace"
```

### Task 7: Reproduce, Validate, And Smoke-Test The End-To-End Result

**Files:**
- Modify: `docs/test-reports/` only if the repo already expects a report for this kind of UI change; otherwise no docs change

- [ ] **Step 1: Run the backend-focused tests introduced by the feature**

Run: `pnpm --filter @dovetail/api test -- src/__tests__/services/admin-activity.test.ts src/__tests__/routes/admin/overview.test.ts src/__tests__/routes/admin/kb-overview.test.ts src/__tests__/routes/admin/users.test.ts src/__tests__/routes/admin/api-keys.test.ts src/__tests__/routes/knowledge-bases.test.ts src/__tests__/routes/articles.test.ts src/__tests__/routes/admin/import.test.ts`

Expected: PASS for all touched backend tests.

- [ ] **Step 2: Run the web-focused tests and build**

Run: `pnpm --filter @dovetail/web test`

Run: `pnpm --filter @dovetail/web build`

Expected: PASS with the new admin helper tests and a successful build.

- [ ] **Step 3: Run the local repro and route checks**

Run:

```bash
just dev
```

Then verify in the browser:

- `http://localhost:3000/admin`
- `http://localhost:3000/admin/users`
- `http://localhost:3000/admin/knowledge-bases`
- `http://localhost:3000/admin/api-keys`
- `http://localhost:3000/kb/housing/admin`
- `http://localhost:3000/kb/housing/admin/users`
- `http://localhost:3000/kb/housing/admin/tags`
- `http://localhost:3000/kb/housing/admin/import`

Expected:

- admin pages render in the new dedicated shell
- global admin shows counts, shortcuts, and activity
- KB admin shows KB-scoped counts, shortcuts, and activity
- existing managers still function inside the shell
- mobile-width checks collapse the nav cleanly

- [ ] **Step 4: Run the repo smoke test**

Run: `just smoke`

Expected: PASS for the local smoke workflow.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify admin workspace overhaul"
```

---

## Self-Review

### Spec coverage

- Shared shell: covered by Tasks 4, 5, and 6.
- Dedicated admin workspace navigation: covered by Tasks 4, 5, and 6 through the new `(admin)` route group.
- Global metrics and shortcuts: covered by Tasks 3 and 5.
- KB metrics and shortcuts: covered by Tasks 3 and 6.
- Recent activity feed: covered by Tasks 1, 2, and 3.
- MLA-constrained visual system: covered by Task 4 and route migrations in Tasks 5 and 6.

### Placeholder scan

- No unresolved placeholder markers remain in the plan.
- The only intentional deferral is `user.deleted` event emission, because no delete route exists in the current codebase. The shared type union and event table still reserve the kind so the feed contract does not change later.

### Type consistency

- Shared activity items use the same `AdminActivityKind` and `AdminActivityItem` types in DB helpers, overview routes, and web formatting helpers.
- The route group paths are consistent between global `/admin/*` and KB `/kb/[kbSlug]/admin/*`.
