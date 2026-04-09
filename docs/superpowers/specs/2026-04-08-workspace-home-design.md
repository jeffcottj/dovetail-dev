# Workspace Home Design

**Date:** 2026-04-08
**Goal:** Replace the current post-login knowledge-base grid with a workspace home that uses the same shell and visual language as the rest of the application, while keeping the landing experience globally scoped until the user chooses a knowledge base.

**Approach:** Reuse the existing KB shell patterns for `/`, but treat the route as a workspace context instead of a KB context. The sidebar remains present with only the KB switcher, the header keeps the standard controls, the search experience becomes explicitly global, and the main pane shows cross-KB recent article activity. The planned `Insights` section is deferred because the current application does not capture article-view analytics.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Landing route behavior | Keep `/` as a workspace home | Preserves a clear global entry point after login |
| Shell consistency | Match the KB page shell | Removes the current visual disconnect between home and KB pages |
| Sidebar contents on `/` | Branding + KB switcher only | Keeps navigation simple until a KB is selected |
| KB selection behavior | Switch into `/kb/[kbSlug]` | Aligns with the existing KB route structure and user expectation |
| Search behavior on `/` | Global search across accessible KBs | Makes the header useful before entering a KB |
| Main content priority | Cross-KB recent article activity | Gives the landing page a useful “what changed” role instead of acting as a launcher |
| Insights panel | Omit for now | No article-view telemetry exists in the current schema or API |

---

## Current State

The current root page in `apps/web/app/(main)/page.tsx` renders a standalone grid of knowledge-base cards. KB routes already use a richer shell in `apps/web/app/(main)/kb/[kbSlug]/layout.tsx`, including:

- persistent sidebar
- header bar with search
- theme toggle and current user area
- content pane styling that fits the rest of the application

The current `SearchBar` component already distinguishes between KB-scoped and root-scoped usage by falling back to `/search` when it is outside KB context. However, there is no root search page yet, so global search is implied in the UI code but not implemented.

The app already records `article.created` and `article.edited` events in `admin_activity_events`, but it does not store article view counts, per-user reads, or weekly popularity metrics.

---

## User Experience

### Workspace Home (`/`)

After login, the user lands on `/` and sees a workspace-scoped shell that visually matches KB pages.

#### Sidebar

- reuse the existing sidebar container, branding, collapse behavior, and overall width
- show the KB switcher as the only navigation control
- do not render the category tree on `/`
- when the user selects a KB, navigate immediately to `/kb/[kbSlug]`

#### Header

- keep the same layout and controls used in KB pages
- keep theme toggle, current user, sign-out, and admin entry behavior unchanged
- replace the KB-oriented search prompt with explicit global language such as `Search all knowledge bases...`
- preserve keyboard shortcut behavior

#### Main Pane

Use a two-column workspace overview:

- primary column: `Recent activity`
- secondary column: small workspace helper panel

The helper panel can include:

- a short explanation that the sidebar selects a KB
- optional admin shortcut to knowledge-base management for admins

The page should read like a workspace dashboard, not a launch screen. That means no large grid of KB cards in the main pane.

### Selecting a Knowledge Base

Selecting a KB from the switcher should move the user out of workspace scope and into the existing KB route tree. Once there, the normal KB shell appears with the category tree and KB-scoped search behavior.

### Global Search

Searching from `/` should go to a new root search page that returns one mixed result list across all KBs the user can access.

Each result should clearly show:

- article title
- KB name
- category label or path when available
- updated timestamp

The page should otherwise behave similarly to the current KB search page so users do not have to learn a different results pattern.

---

## Data and API Design

### Workspace Activity Feed

Add a workspace-scoped API surface that returns recent article activity across all KBs visible to the current user.

The feed should:

- include only article create and article edit events
- include events only for KBs the user can access
- include actor name and email
- include KB identity
- include subject/article label
- sort newest first
- return a small bounded list, such as the most recent 20 events

This can likely reuse the existing `admin_activity_events` table and normalization helpers, but it should not depend on admin-only routes or admin-only page framing.

### Global Search

Add a workspace/global search route in the web app and a matching API query path in the API app.

The global search response should:

- return only articles the user is allowed to access
- include KB identity for each result
- preserve the same pagination shape currently used by KB search
- initially support full-text mode; semantic and hybrid modes can follow the existing search implementation if the access-scoping logic stays clear

The current KB search page is the reference behavior, but the new root search flow must not require a KB context provider.

### Insights

Do not implement the requested `Insights` panel in this design. The current system does not appear to track:

- article view events
- article visit counts
- trailing 7-day readership metrics

Adding insights would require a separate analytics design covering event capture, aggregation, retention, and user/privacy expectations.

---

## Components and Layout Changes

### Web App

Expected additions or changes:

- update `apps/web/app/(main)/page.tsx` to render workspace-home content instead of the KB card grid
- extract or introduce a reusable shell variant for the root workspace route if needed
- update `apps/web/components/SearchBar.tsx` so the root context is visibly global
- add a root search page at `apps/web/app/(main)/search/page.tsx`
- add a workspace activity component or adapt the existing activity feed styling for non-admin usage

### API App

Expected additions:

- workspace activity endpoint for article activity across accessible KBs
- global search endpoint or an extension of existing search logic that supports cross-KB scope

### Shared Types

Expected additions:

- a workspace activity response type if the existing admin activity item type is not sufficient on its own
- a global search result type that includes KB identity in the payload

---

## Authorization and Access Rules

The workspace home must respect the same visibility rules as the rest of the application.

- only show KBs the user can access in the switcher
- only show activity for KBs the user can access
- only show global search results for articles the user can access
- preserve current admin affordances, but do not make workspace home admin-only

No new privileges are introduced by this design. The root route becomes more useful, but not more permissive.

---

## Error Handling

### Workspace Activity Failure

If the activity feed fails to load:

- keep the shell rendered
- show a concise unavailable state in the activity panel
- do not block KB selection or search

### Global Search Failure

If global search fails:

- keep the header and search form intact
- show an inline error state similar to the existing KB search page

### No Accessible KBs

If a user has access to zero KBs:

- keep the workspace shell
- replace the helper panel copy with a contact-an-admin message
- activity will naturally be empty

---

## Testing and Validation

### Web

- update or add route tests for the new `/` experience
- add tests for root search page rendering and empty/error states
- add tests that the search bar uses global copy outside KB context

### API

- add route tests for workspace activity access filtering
- add route tests for global search access filtering and KB labeling
- verify viewer/editor/admin behavior across shared and restricted KBs

### Manual Validation

Reproduction flow for implementation:

1. Start local development with the standard hybrid workflow.
2. Sign in through `/login` as a seeded local user.
3. Visit `/` and confirm the page uses the shared shell instead of the KB card grid.
4. Use the sidebar switcher to enter a KB and confirm existing KB routing still works.
5. Submit a search from `/` and confirm results include mixed KB results with KB labels.
6. Create or edit an article in an accessible KB, return to `/`, and confirm the activity appears in the workspace feed.

---

## Out of Scope

- article popularity or most-visited insights
- new analytics or telemetry capture
- a major redesign of the KB shell itself
- changing KB-specific search behavior beyond the shared search bar copy and root/global path support
- replacing the KB switcher with a richer navigation system on the landing page

---

## Implementation Notes

- prefer reusing existing shell components over creating a parallel workspace-only design system
- keep the first pass narrow: workspace shell, global search, cross-KB article activity
- if global search initially ships with only full-text mode, document that clearly in the implementation plan rather than forcing a broader search refactor
