# Step 1 Implementation Plan: KB Visibility Semantics And Authorization Helpers

## Purpose

This plan covers step 1 from `docs/product-gap-analysis.md`:

> Fix KB visibility semantics and authorization helpers.

The goal is to establish the backend authorization foundation that later product-gap steps can reuse. This step should make private knowledge base semantics possible, prevent the global `viewer` fallback from granting access to every KB, and provide focused helper functions for later route-level enforcement.

This step should not build the full admin UI for changing access policy. That belongs to the later "Add KB default access policy UI/API/schema" step. However, a persisted KB access policy is needed to implement and test the visibility model safely, so this plan includes the minimal schema/type/migration work for `defaultAccess`.

## Current Behavior

Relevant current behavior:

- `knowledge_bases` has no default access policy field.
- `GET /api/knowledge-bases` returns every KB to every authenticated user.
- `GET /api/knowledge-bases/:id` returns any existing KB to every authenticated user.
- `resolveRole()` in `apps/api/src/services/permissions.ts` falls back to the user's global role when no category or KB role exists.
- That global fallback means global `viewer` users effectively get viewer access everywhere, which makes private KB behavior impossible.
- `requireKbAdmin()` in `apps/api/src/middleware/resolveKb.ts` uses direct SQL and does not share a central KB authorization model.

Primary files to inspect:

- `packages/db/src/schema.ts`
- `packages/types/src/index.ts`
- `apps/api/src/services/permissions.ts`
- `apps/api/src/middleware/resolveKb.ts`
- `apps/api/src/routes/knowledge-bases.ts`
- `apps/api/src/app.ts`
- `apps/api/src/__tests__/services/permissions.test.ts`
- `apps/api/src/__tests__/routes/knowledge-bases.test.ts`

## Product Semantics To Implement

Add this KB access model:

- `defaultAccess = 'org_viewer'`: every authenticated user can see the KB and has at least their global role in that KB. Existing behavior for current KBs should remain compatible because existing KBs should default to `org_viewer`.
- `defaultAccess = 'private'`: no implicit access from global `viewer` or global `editor`.
- Global `admin`: can see and administer every KB.
- Explicit KB role: grants visibility and the assigned KB role.
- Explicit category role: grants visibility to the parent KB, even when the KB is private.
- Category-only visibility does not mean broad KB-wide article/category access. Step 2 must still enforce category/article-level permission filters on nested routes.
- For invisible private KBs, read/detail endpoints should hide existence from normal users. Prefer `404` for direct KB reads when a KB exists but is not visible to the caller.

## Reproduction Recipe

Before the fix, the issue can be observed with route tests or locally:

1. Create or mock two KBs, one intended to be public to the organization and one intended to be private.
2. Authenticate as a normal global `viewer`.
3. Call `GET /api/knowledge-bases`.
4. Observe that the response includes every KB because the route only checks authentication.
5. Call the role resolver for a KB/category where the user has no explicit assignment.
6. Observe that the resolver falls back to global `viewer`, which means "private" KBs cannot be represented.

After the fix, verify these outcomes:

1. Authenticated viewer sees `org_viewer` KBs.
2. Authenticated viewer does not see private KBs without explicit access.
3. User with an explicit KB role sees that private KB.
4. User with only a category role under a private KB sees that KB in KB selectors/lists.
5. Global admin sees every KB.
6. Direct `GET /api/knowledge-bases/:id` returns `404` for an invisible private KB.

## Implementation Plan

### 1. Add KB Access Policy To The Database Model

Add a new enum and column in `packages/db/src/schema.ts`.

Suggested schema shape:

```ts
export const kbDefaultAccessEnum = pgEnum('kb_default_access', ['org_viewer', 'private']);

export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  defaultAccess: kbDefaultAccessEnum('default_access').notNull().default('org_viewer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

Add a migration, likely `packages/db/migrations/0007_add_kb_default_access.sql`.

Suggested SQL:

```sql
CREATE TYPE kb_default_access AS ENUM ('org_viewer', 'private');

ALTER TABLE knowledge_bases
  ADD COLUMN default_access kb_default_access NOT NULL DEFAULT 'org_viewer';
```

Update Drizzle migration metadata as required by the repo's migration workflow. Existing KBs must be backfilled by the default value and remain `org_viewer`.

### 2. Update Shared Types

Update `packages/types/src/index.ts`.

Suggested additions:

```ts
export type KbDefaultAccess = 'org_viewer' | 'private';

export interface KnowledgeBase {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultAccess: KbDefaultAccess;
  createdAt: Date;
}
```

Then update test fixtures and mocks that construct `KnowledgeBase` objects so they include `defaultAccess`.

### 3. Replace Implicit Global Fallback With Explicit Helper Semantics

Refactor `apps/api/src/services/permissions.ts` around KB-aware helpers.

Recommended exported helper surface:

```ts
export type EffectiveRole = Role | null;

export function hasMinimumRole(userRole: EffectiveRole, requiredRole: Role): boolean;

export function isGlobalAdmin(globalRole: Role): boolean;

export async function resolveEffectiveKbRole(args: {
  userId: string;
  globalRole: Role;
  knowledgeBaseId: string;
}): Promise<EffectiveRole>;

export async function resolveEffectiveCategoryRole(args: {
  userId: string;
  globalRole: Role;
  categoryId: string;
  knowledgeBaseId?: string;
}): Promise<EffectiveRole>;

export async function canViewKnowledgeBase(args: {
  userId: string;
  globalRole: Role;
  knowledgeBaseId: string;
}): Promise<boolean>;

export async function listVisibleKnowledgeBases(args: {
  userId: string;
  globalRole: Role;
}): Promise<KnowledgeBase[]>;
```

`hasMinimumRole(null, requiredRole)` must return `false`.

`resolveEffectiveKbRole()` behavior:

- Load the KB policy for the requested KB.
- Return `admin` for global admins.
- Return the explicit KB role when one exists.
- For `org_viewer`, return the user's global role.
- For `private`, return `null` when no explicit KB role exists.

`resolveEffectiveCategoryRole()` behavior:

- Check the user's most specific category role using the existing recursive ancestor lookup.
- If a category role exists, return it.
- Otherwise delegate to `resolveEffectiveKbRole()`.
- If `knowledgeBaseId` is omitted, determine the category's KB from the database before resolving the KB role.

`canViewKnowledgeBase()` behavior:

- Return `true` for global admin.
- Return `true` when `resolveEffectiveKbRole()` returns a role.
- Return `true` when the user has any category role under that KB.
- Return `false` otherwise.

`listVisibleKnowledgeBases()` behavior:

- Return all KBs for global admin.
- For non-admin users, include KBs where:
  - `default_access = 'org_viewer'`, or
  - the user has an explicit row in `user_kb_roles`, or
  - the user has a category role on any category in that KB.
- De-duplicate KB rows.
- Preserve stable ordering. Use the current implicit behavior if there is one, or order by KB name/creation time consistently.

Keep the existing `resolveRole()` export as a compatibility wrapper if many current routes still import it. It should delegate to `resolveEffectiveCategoryRole()`. Add a short comment that new code should use the more specific helper names. Step 2 can migrate call sites route by route.

### 4. Centralize KB Middleware Behavior

Update `apps/api/src/middleware/resolveKb.ts`.

Keep `resolveKb()` responsible for loading `req.kb` by `:kbId`.

Add a visibility middleware:

```ts
export async function requireVisibleKb(req: AuthKbRequest, res: Response, next: NextFunction) {
  // Requires authMiddleware and resolveKb first.
}
```

Expected behavior:

- Return `401` when the request has no authenticated user.
- Return `403` when no KB is resolved.
- Call `canViewKnowledgeBase()`.
- Continue when visible.
- Return `404` or `403` consistently when not visible. For normal KB context reads, prefer `404` to hide private KB existence.

Update `requireKbAdmin()` so it calls `resolveEffectiveKbRole()` instead of direct SQL. Expected behavior:

- Return `401` when unauthenticated.
- Allow global admin through `resolveEffectiveKbRole()`.
- Allow explicit KB admin.
- Do not allow global editor on a private KB unless that user has explicit KB admin.
- Keep response status semantics aligned with the existing route tests unless tests are intentionally updated.

Do not blindly mount `requireVisibleKb` on every nested KB route in `apps/api/src/app.ts` during this step. Several nested routes still lack category/article filtering. Step 2 is responsible for full permission enforcement across those routes. Applying a broad visibility middleware now could create a false sense of safety or expose full KB contents to category-only users.

### 5. Filter Knowledge Base List And Detail Routes

Update `apps/api/src/routes/knowledge-bases.ts`.

For `GET /api/knowledge-bases`:

- Keep `authMiddleware`.
- Use `listVisibleKnowledgeBases({ userId: req.user.id, globalRole: req.user.role })`.
- Return only visible KBs.

For `GET /api/knowledge-bases/:id`:

- Load the KB by ID.
- Return `404` when it does not exist.
- Use `canViewKnowledgeBase()`.
- Return `404` when the KB is invisible to the user.
- Return the KB when visible.

For `POST /api/knowledge-bases`:

- Keep global admin only.
- Do not expose `defaultAccess` in the request body unless the team intentionally pulls part of step 3 into this step.
- Let the DB default create new KBs as `org_viewer`.

For `PATCH /api/knowledge-bases/:id`:

- Keep existing global-admin-only behavior for this step.
- Do not add access policy updates yet unless explicitly agreed.

For KB user role management routes:

- Keep using `resolveKb` plus the updated `requireKbAdmin()`.
- Add or update tests only if helper changes alter behavior.

### 6. Update Seeds And Test Fixtures

Existing seed KBs should stay organization-visible.

If seed data explicitly defines KB objects, either:

- Add `defaultAccess: 'org_viewer'`, or
- Rely on the database default if seed insertion omits the field.

Update route test fixtures such as:

```ts
const orgKb = {
  id: 'kb-1',
  name: 'Default',
  slug: 'default',
  description: null,
  defaultAccess: 'org_viewer' as const,
  createdAt: new Date(),
};

const privateKb = {
  id: 'kb-2',
  name: 'Private',
  slug: 'private',
  description: null,
  defaultAccess: 'private' as const,
  createdAt: new Date(),
};
```

### 7. Add Focused Tests

Update `apps/api/src/__tests__/services/permissions.test.ts`.

Required coverage:

- `hasMinimumRole(null, 'viewer')` returns `false`.
- `resolveEffectiveKbRole()` returns the global role for `org_viewer` KBs.
- `resolveEffectiveKbRole()` returns `null` for private KBs with no explicit KB role.
- `resolveEffectiveKbRole()` returns explicit KB role for private KBs.
- `resolveEffectiveKbRole()` returns `admin` for global admin on private KB.
- `resolveEffectiveCategoryRole()` returns the most specific category role.
- `resolveEffectiveCategoryRole()` falls back to KB semantics when no category role exists.
- `canViewKnowledgeBase()` returns `true` for category-only access.
- `listVisibleKnowledgeBases()` includes org-visible KBs, explicit KB-role private KBs, and category-role private KBs.
- `listVisibleKnowledgeBases()` excludes inaccessible private KBs.

Update `apps/api/src/__tests__/routes/knowledge-bases.test.ts`.

Required coverage:

- `GET /api/knowledge-bases` returns `401` without auth.
- Viewer list includes `org_viewer` KBs.
- Viewer list excludes private KBs without explicit access.
- User with explicit KB role sees private KB.
- User with category-only role sees private KB in the list.
- Global admin sees all KBs.
- `GET /api/knowledge-bases/:id` returns visible KB details.
- `GET /api/knowledge-bases/:id` returns `404` for missing KB.
- `GET /api/knowledge-bases/:id` returns `404` for an invisible private KB.
- Global admin can fetch a private KB by ID.

Update `apps/api/src/__tests__/middleware/resolveKb.test.ts` if the middleware refactor affects `requireKbAdmin()` behavior.

### 8. Minimal Frontend Impact

This step should not require direct frontend changes if all existing KB selectors already load from `GET /api/knowledge-bases`.

Existing consumers that should automatically receive visible-only KBs:

- Workspace sidebar.
- KB switcher.
- Admin context switcher.
- Search page KB selector.
- Admin KB list where the current user is global admin.

If frontend tests assert counts or exact KB names, update those fixtures to reflect the new filtered API behavior. Do not add access policy create/edit controls in this step.

## Validation

Run focused checks first:

```bash
pnpm --filter @dovetail/db test
pnpm --filter @dovetail/api test -- src/__tests__/services/permissions.test.ts src/__tests__/routes/knowledge-bases.test.ts
pnpm --filter @dovetail/api build
```

If middleware or shared type changes affect broader route tests, also run:

```bash
pnpm --filter @dovetail/api test -- src/__tests__/middleware/resolveKb.test.ts src/__tests__/routes/categories.test.ts src/__tests__/routes/articles.test.ts
```

For local repro validation:

```bash
just db-reset
just dev
```

Then verify:

- `GET /api/knowledge-bases` as a normal viewer does not return inaccessible private KBs.
- The same endpoint as global admin returns all KBs.
- A user with explicit KB or category access sees the private KB.

## Acceptance Criteria

This step is complete when:

- `knowledge_bases` has a persisted `default_access` policy.
- Existing KBs default to `org_viewer`.
- Global `viewer` no longer implicitly grants access to private KBs.
- Global `editor` no longer implicitly grants access to private KBs.
- Global `admin` still sees and administers every KB.
- Explicit KB roles make private KBs visible.
- Category roles make the parent private KB visible.
- `GET /api/knowledge-bases` returns only KBs visible to the current user.
- `GET /api/knowledge-bases/:id` hides invisible private KBs.
- Reusable authorization helpers are covered by focused tests.
- Existing route code can continue using the legacy `resolveRole()` wrapper until step 2 migrates route-level enforcement.

## Out Of Scope

Do not implement these items in step 1 unless explicitly approved:

- Admin UI controls for choosing org-visible vs private.
- API request body support for editing `defaultAccess`.
- Full permission enforcement across articles, categories, tags, versions, attachments, workspace search, imports, and bulk publish.
- Multi-KB search.
- Last edited metadata.
- Attachment authorization.

## Risks And Follow-Up

The main risk is confusing KB visibility with permission to read every resource in the KB. Category-only access should make the KB discoverable in selectors, but step 2 must still constrain category/article routes so category-only users cannot read unrelated categories or articles.

Another risk is breaking current route tests that expect `resolveRole()` to fall back directly to global role. Keep a compatibility wrapper for `resolveRole()` and migrate route call sites deliberately in step 2.

Step 2 should use the helpers from this step to enforce:

- KB visibility.
- KB admin authority.
- Article read permission.
- Article edit permission.
- Category manage permission.
- Search and maintenance permission filters.
