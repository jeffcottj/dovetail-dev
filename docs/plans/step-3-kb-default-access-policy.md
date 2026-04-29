# Step 3 Implementation Plan: KB Default Access Policy UI/API/Schema

## Purpose

This plan covers step 3 from `docs/product-gap-analysis.md`:

> Add KB default access policy UI/API/schema.

The goal is to make the persisted knowledge base access policy manageable by admins. Step 1 establishes the authorization semantics and may already add the `defaultAccess` schema/type foundation. Step 3 should expose that foundation through the create/edit API and admin UI so global admins and KB admins can choose whether a knowledge base is organization-visible or private.

## Current Behavior

Relevant current behavior in this branch:

- `packages/db/src/schema.ts` already defines `kbDefaultAccessEnum` and `knowledgeBases.defaultAccess`.
- `packages/db/migrations/0007_add_kb_default_access.sql` already adds `default_access` with a default of `org_viewer`.
- `packages/types/src/index.ts` already exports `KbDefaultAccess` and includes `defaultAccess` on `KnowledgeBase`.
- `apps/api/src/routes/knowledge-bases.ts` returns `defaultAccess` from list/detail responses.
- `POST /api/knowledge-bases` does not accept a requested access policy and always relies on the DB default.
- `PATCH /api/knowledge-bases/:id` only accepts `name` and `description`.
- `apps/web/app/(main)/admin/knowledge-bases/KbManager.tsx` can create and delete KBs, but does not show or edit access policy.
- KB admin pages show overview/users/tags/import/activity, but there is no settings page for access policy changes.

Primary files to inspect:

- `packages/db/src/schema.ts`
- `packages/db/migrations/0007_add_kb_default_access.sql`
- `packages/types/src/index.ts`
- `apps/api/src/routes/knowledge-bases.ts`
- `apps/api/src/middleware/resolveKb.ts`
- `apps/api/src/services/permissions.ts`
- `apps/api/src/services/admin-activity.ts`
- `apps/api/src/__tests__/routes/knowledge-bases.test.ts`
- `apps/web/app/(main)/admin/knowledge-bases/KbManager.tsx`
- `apps/web/app/(admin)/admin/knowledge-bases/page.tsx`
- `apps/web/app/(admin)/kb/[kbSlug]/admin/page.tsx`
- `apps/web/lib/admin/nav.ts`
- `apps/web/lib/admin/kb-workspace.ts`

## Product Semantics To Implement

Use the access policy model from the PRD:

- `org_viewer`: all authenticated staff receive viewer access by default.
- `private`: no default viewer access; users need explicit KB or category roles, except global admins.
- Global admins can choose the default access policy when creating a KB.
- Global admins can change the default access policy later.
- KB admins can change the default access policy later for KBs they administer.
- Existing KBs remain `org_viewer` unless explicitly changed.
- Policy changes must immediately affect KB visibility and permission resolution through the helpers implemented in steps 1 and 2.

## Verification Recipe

Use this recipe before and after implementation to prove the gap is closed.

Before implementation:

1. Log in locally as `Local Admin`.
2. Open `/admin/knowledge-bases`.
3. Create a knowledge base.
4. Observe there is no way to select `org_viewer` versus `private`.
5. Inspect the created KB through `GET /api/knowledge-bases/:id`.
6. Observe `defaultAccess` is always `org_viewer`.
7. Try `PATCH /api/knowledge-bases/:id` with `{ "defaultAccess": "private" }`.
8. Observe the policy is ignored or rejected because the update schema does not support it.

After implementation:

1. Create a KB as `Local Admin` with `defaultAccess: "private"`.
2. Confirm `GET /api/knowledge-bases/:id` returns `defaultAccess: "private"` for an admin.
3. Confirm a normal viewer without explicit access does not see that KB in `GET /api/knowledge-bases`.
4. Change the policy to `org_viewer`.
5. Confirm the same viewer can now see the KB.
6. Assign a KB admin role to a non-global-admin user.
7. Log in as that KB admin and change the policy from the KB settings UI.
8. Confirm the policy update is visible on the global KB list and KB admin overview/settings pages.

## Implementation Plan

### 1. Confirm Or Complete The Schema Foundation

If step 1 has already landed, keep the existing schema as-is:

```ts
export const kbDefaultAccessEnum = pgEnum('kb_default_access', ['org_viewer', 'private']);

export const knowledgeBases = pgTable('knowledge_bases', {
  // ...
  defaultAccess: kbDefaultAccessEnum('default_access').notNull().default('org_viewer'),
});
```

If this plan is applied on a branch without the step 1 schema work, add:

- The Drizzle enum and column in `packages/db/src/schema.ts`.
- A migration adding `kb_default_access` and `knowledge_bases.default_access`.
- `KbDefaultAccess` and `KnowledgeBase.defaultAccess` in `packages/types/src/index.ts`.
- Seed/test fixture updates so existing KBs are `org_viewer`.

Do not add a second migration if `0007_add_kb_default_access.sql` is already present and correct.

### 2. Add A Shared Access Policy Validator

In `apps/api/src/routes/knowledge-bases.ts`, define a single zod enum for the accepted policy values:

```ts
const kbDefaultAccessSchema = z.enum(['org_viewer', 'private']);
```

Use it in both create and update schemas:

```ts
const createKbSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  defaultAccess: kbDefaultAccessSchema.default('org_viewer'),
});

const updateKbSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  defaultAccess: kbDefaultAccessSchema.optional(),
});
```

Keep invalid policy values as `400` validation errors through the existing `validateBody()` path.

### 3. Support Policy On KB Creation

Update `POST /api/knowledge-bases`:

- Read `defaultAccess` from the validated body.
- Insert it with `name`, `slug`, and `description`.
- Preserve slug conflict retry behavior, including the same chosen `defaultAccess`.
- Include the selected policy in the response through Drizzle `returning()`.
- Add admin activity metadata for the initial policy, for example `{ defaultAccess }`.

Global admin remains the only actor allowed to create KBs.

### 4. Support Policy Updates With Correct Authorization

Update `PATCH /api/knowledge-bases/:id` so it can update `defaultAccess`.

Authorization should change from global-admin-only to:

- global admin, or
- KB admin for the target KB.

Prefer reusing the existing `resolveKb` plus `requireKbAdmin` middleware if route shape and params allow it. If the generic `/:id` route cannot use `resolveKb` directly because the parameter is named `id`, either:

- add a small local resolver for this route that loads the KB and calls the same KB admin helper, or
- add a dedicated `/:kbId/settings` or `/:kbId/access-policy` route using the existing `kbId` middleware convention.

Keep the API surface simple. A single `PATCH /api/knowledge-bases/:id` route is preferable if it can be made KB-admin-aware without duplicating authorization logic.

Update behavior:

- Return `404` when the KB does not exist.
- Return `403` when the user is authenticated but is neither global admin nor KB admin.
- Update only supplied fields.
- If no supported fields are supplied, either return the unchanged KB or a `400` validation error; choose the behavior that matches existing route conventions.
- Record a policy-change admin activity event when `defaultAccess` changes.

Consider adding a new `AdminActivityKind`, such as `kb.access_changed`, with metadata:

```ts
{
  from: 'org_viewer',
  to: 'private'
}
```

If adding a new event kind is more churn than this step needs, at least include policy metadata on a more general KB update event. Do not silently change access policy without an audit trail.

### 5. Display Policy In Global KB Management

Update `KbManager` on `/admin/knowledge-bases`:

- Show a compact policy label for each KB.
- Add an access policy control to the create modal.
- Default the create form to `org_viewer`.
- Send `defaultAccess` in the create request body.
- Add an edit affordance for `name`, `description`, and `defaultAccess`, or at minimum for `defaultAccess` if the existing UI should stay narrow.
- Update local state after successful create/update so the visible list reflects the new policy.

Recommended labels:

- `Org-visible`: every authenticated staff user can view by default.
- `Private`: only assigned users and admins can view.

Keep the UI terse. This is an admin operations page, not a marketing surface.

### 6. Add A KB Admin Settings Surface

Because the PRD allows KB admins to change a KB's default access policy, add a KB-scoped settings page:

- Route: `apps/web/app/(admin)/kb/[kbSlug]/admin/settings/page.tsx`
- Navigation label: `Settings` in `apps/web/lib/admin/nav.ts`.
- Page content: one settings section for default access policy.
- Data source: current KB from `getKbBySlug()` or `fetchKbAdminOverview()`.
- Mutation: `PATCH /api/knowledge-bases/:id` with `{ defaultAccess }`.

The page should be available only to users who can pass the existing KB admin layout guard. The API still needs to enforce authorization independently.

If a new page feels too broad for the first implementation, put the control on the existing KB overview page, but still add a clear place where KB admins can find and change the policy.

### 7. Update Shared Formatting And Activity UI

If adding `kb.access_changed` or `kb.updated`:

- Extend `AdminActivityKind` in `packages/types/src/index.ts`.
- Update `apps/web/lib/admin/format.ts` to render a useful activity line.
- Add or update tests in `apps/web/lib/admin/format.test.ts`.
- Ensure global and KB activity feeds show policy updates because the event includes `knowledgeBaseId`.

Suggested copy:

```txt
{actor} changed {kb} access to Private
```

Use metadata to render `Org-visible` or `Private` rather than raw enum values.

### 8. Add Focused API Tests

Update `apps/api/src/__tests__/routes/knowledge-bases.test.ts`.

Required coverage:

- `POST /api/knowledge-bases` accepts `defaultAccess: 'private'`.
- `POST /api/knowledge-bases` defaults to `org_viewer` when omitted.
- `POST /api/knowledge-bases` rejects invalid `defaultAccess`.
- Slug conflict retry preserves requested `defaultAccess`.
- `PATCH /api/knowledge-bases/:id` updates `defaultAccess` for a global admin.
- `PATCH /api/knowledge-bases/:id` updates `defaultAccess` for an explicit KB admin.
- `PATCH /api/knowledge-bases/:id` rejects a non-admin/non-KB-admin.
- `PATCH /api/knowledge-bases/:id` rejects invalid `defaultAccess`.
- Policy update records admin activity when the value changes.
- Updating `name` or `description` without `defaultAccess` keeps the previous policy.

If authorization helper behavior changes, add targeted tests in:

- `apps/api/src/__tests__/middleware/resolveKb.test.ts`
- `apps/api/src/__tests__/services/permissions.test.ts`

### 9. Add Focused Web Tests

Add component/page tests where the current test setup supports them.

Suggested coverage:

- Global KB manager displays `Org-visible` and `Private` labels.
- Create modal sends selected `defaultAccess`.
- Policy edit action sends `PATCH /api/knowledge-bases/:id`.
- KB admin navigation includes `Settings`.
- KB settings page renders the current policy and allows a KB admin to submit a change.
- Activity formatting renders policy-change events clearly.

If direct component tests around client mutations are awkward, keep tests at the formatter/nav/page-render level and rely on API route tests for mutation correctness.

### 10. Local Validation

Run focused checks first:

```bash
pnpm --filter @dovetail/api test -- src/__tests__/routes/knowledge-bases.test.ts
pnpm --filter @dovetail/web test -- lib/admin/format.test.ts lib/admin/nav.test.ts
pnpm --filter @dovetail/api build
pnpm --filter @dovetail/web build
```

Then validate the local workflow:

```bash
just db-reset
just dev
```

Manual checks:

- `/admin/knowledge-bases` shows access policy for every KB.
- Creating a private KB persists `defaultAccess: "private"`.
- A normal viewer cannot see the private KB until assigned access or the policy changes to `org_viewer`.
- A global admin can change the policy from global KB management.
- A KB admin can change the policy from the KB admin settings page.
- Recent activity shows the policy change.

Use `just smoke` after the focused checks pass if the change touches shared admin layout, auth middleware, or KB list behavior broadly.

## Acceptance Criteria

This step is complete when:

- KB create API accepts and persists `defaultAccess`.
- KB update API accepts and persists `defaultAccess`.
- Existing KBs remain `org_viewer` by default.
- Global admins can create KBs as org-visible or private.
- Global admins can change an existing KB's access policy.
- KB admins can change the access policy for KBs they administer.
- Non-admin users without KB admin authority cannot change access policy.
- Global admin KB management displays and edits policy.
- KB admin UI displays and edits policy.
- Invalid policy values are rejected by API validation.
- Policy changes affect visibility through the existing authorization helpers.
- Tests cover create, update, authorization, invalid input, and UI display/mutation behavior.
- Activity/audit output records policy changes or equivalent KB update metadata.

## Out Of Scope

Do not include these items in step 3:

- Reworking article/category/tag permission enforcement from step 2.
- Multi-KB search.
- Last edited metadata.
- Attachment authorization.
- A full audit log redesign.
- Bulk policy changes across multiple KBs.
- Per-group or Entra-group access rules.

## Risks And Follow-Up

The main risk is letting the UI update policy while the route still uses global-admin-only authorization or no KB-admin authorization. Treat API authorization as the source of truth and test both global-admin and KB-admin cases.

Another risk is changing a KB from `org_viewer` to `private` and leaving current users surprised because their implicit access disappears. For the first implementation, clear labels may be enough. If user testing shows confusion, add a confirmation dialog only for the `org_viewer` to `private` transition.

If policy changes need stronger auditability later, expand admin activity events with dedicated before/after metadata and expose those fields in the activity feed.
