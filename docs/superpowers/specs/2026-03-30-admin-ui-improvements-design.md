# Admin UI Improvements Design

## Overview

A set of targeted improvements to the admin interface to improve navigation, reduce clutter, support KB-scoped admin context switching, and add user search.

## Changes

### 1. Sidebar Header & Branding

- Change the logo-area label from "MARYLAND LEGAL AID" to "DOVETAIL". Keep "Admin" heading unchanged.
- Widen the admin sidebar from `w-72` (288px) to `w-96` (384px) to match the KB sidebar width.
- Add a prominent "Return to Knowledge Base" link between the header and the nav section, navigating to `/`. Styled as a visible button/link distinct from the nav items.

### 2. AdminContextSwitcher Component

A new dropdown component placed below the "Return to Knowledge Base" link, above the nav section. Replaces the static "GLOBAL ADMIN" section label.

**UI and behavior:**

- Dropdown button displays the current context: "Global Admin" or the selected KB name.
- Dropdown list shows "Global Admin" at the top, then all KBs the user has admin access to, sorted alphabetically.
- Selecting an item navigates: "Global Admin" to `/admin`, KB to `/kb/{slug}/admin`.
- Current context is determined from the URL path: `/kb/[slug]/admin` = KB context, `/admin` = global context.
- Keyboard navigation, escape-to-close, click-outside-to-close (matching existing `KbSwitcher` patterns).

**Non-global-admin users:**

- The "Global Admin" option is hidden.
- Defaults to the first KB alphabetically that the user is admin for.

**Data fetching:**

- KBs fetched from `/api/knowledge-bases` (same endpoint `KbSwitcher` uses).
- Global admins see all KBs plus the "Global Admin" option.
- Non-global-admins see only KBs where they have an admin role via `user_kb_roles`. If the API does not currently expose per-KB role info, add a field or a separate endpoint to determine which KBs the user can administer.

**Sidebar nav updates on context switch:**

- Global Admin context shows: Overview, Users, Knowledge Bases, API Keys, Recent Activity.
- KB context shows: KB Overview, Users & Roles, Tags, Import, Recent Activity.

### 3. Remove Quick Actions

Remove the `AdminQuickActions` component and its grid area from the dashboard layout entirely. The sidebar nav links serve the same purpose.

### 4. Recent Activity Page

- Remove `AdminActivityFeed` from the dashboard overview page.
- Create a new route at `/admin/activity` (global) and `/kb/[kbSlug]/admin/activity` (KB-specific).
- Render the existing `AdminActivityFeed` component full-width on the new page.
- Add "Recent Activity" as a sidebar nav item in both global and KB nav sections in `nav.ts`.

### 5. Remove Descriptive Header Text

Remove the `description` prop and its rendering from `AdminSectionHeader`. Drop all `description` strings from page usages. Keep the title, scope badge, and primary actions.

### 6. Server-Side User Search

**API:** Add an optional `search` query parameter to `GET /api/admin/users`. When provided, filter users where `name` or `email` matches the search string using case-insensitive `ILIKE` in Postgres.

**Frontend:** Add a text input above the users table in `UserList`. On each keystroke (debounced ~300ms), re-fetch `/api/admin/users?search={term}&limit=100`. No submit button — the table auto-filters as the user types. Include a clear button to reset.

**Empty state:** When search returns no results, display "No users matching '{term}'" instead of the generic "No users found."

## Files Affected

### New files

- `apps/web/components/admin/AdminContextSwitcher.tsx` — KB/global admin dropdown
- `apps/web/app/(admin)/admin/activity/page.tsx` — global recent activity page
- `apps/web/app/(admin)/kb/[kbSlug]/admin/activity/page.tsx` — KB recent activity page

### Modified files

- `apps/web/components/admin/AdminNav.tsx` — branding text, sidebar width, "Return to KB" link, replace section label with AdminContextSwitcher
- `apps/web/components/admin/AdminWorkspaceLayout.tsx` — remove Quick Actions and Activity Feed from dashboard grid
- `apps/web/components/admin/AdminSectionHeader.tsx` — remove description prop and rendering
- `apps/web/app/(admin)/admin/page.tsx` — remove description from header, remove activity feed
- `apps/web/app/(admin)/admin/users/page.tsx` — remove description from header
- `apps/web/app/(admin)/admin/users/UserList.tsx` — add search input, debounced fetch, updated empty state
- `apps/web/app/(admin)/admin/knowledge-bases/page.tsx` — remove description from header
- `apps/web/app/(admin)/admin/api-keys/page.tsx` — remove description from header
- `apps/web/lib/admin/nav.ts` — add Recent Activity link to global and KB nav sections
- `apps/api/src/routes/admin/users.ts` — add `search` query parameter with ILIKE filtering

## Out of Scope

- Pagination for the users list (current limit=100 stays)
- Enhanced activity feed (filtering, pagination, loading more items)
- Any changes to KB admin pages beyond adding the activity route and context switcher
- Role-based filtering of the KB list in the API (client-side filtering is sufficient for now)
