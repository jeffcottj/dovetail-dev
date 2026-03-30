# Admin Overhaul Design

Date: 2026-03-28
Branch: `feature/admin-overhaul`
Status: Proposed

## Summary

Redesign the global admin area and KB-specific admin pages into a shared admin workspace that feels like a modern operations console while staying inside Maryland Legal Aid branding constraints.

The new admin experience should make three things prominent:

- system status and counts
- high-value workflow shortcuts
- a recent activity feed scoped globally or to a specific knowledge base

This is a UI and information architecture overhaul first. It should preserve existing admin workflows and manager components where possible, then wrap them in a stronger shared shell.

## Problem

The current admin pages are structurally sparse. Most pages render only a heading and a single manager component. This creates several issues:

- no persistent admin navigation or shared operating context
- weak distinction between global admin scope and KB-specific admin scope
- no high-signal summary layer for counts, role mix, or recent changes
- no quick-action surface for common admin tasks
- no activity visibility, which makes the system feel static and low-confidence

## Goals

- Create one reusable admin workspace shell for global and KB-scoped admin routes.
- Make admin pages feel operational, denser, and more purposeful than the reader-facing product.
- Keep the most important metrics, actions, and recent activity visible near the top of each page.
- Preserve current workflows for managing users, KBs, API keys, tags, and imports.
- Keep the implementation narrow by reusing existing manager components and deriving activity from current records before adding any dedicated audit subsystem.

## Non-Goals

- Rebuild every manager component from scratch.
- Introduce a full audit log platform or permissions refactor in the first pass.
- Change public KB browsing or article-reading layouts.
- Add speculative admin features that are not already implied by existing routes and data.

## Design Principles

- Shared shell first: global and KB admin must feel like one workspace with clear scope changes, not separate mini-apps.
- Status before chrome: the interface should immediately answer what is happening, what needs attention, and what actions are available.
- Scope clarity: every page must make it obvious whether actions are global or KB-scoped.
- MLA-constrained ops console: sharper, more operational surfaces without drifting away from Maryland Legal Aid typography, colors, and trust cues.
- Lightweight backend requirements: prefer aggregating from existing entities and timestamps before inventing new persistence structures.

## Information Architecture

### Global admin routes

The left rail should expose a stable global group:

- `Overview`
- `Users`
- `Knowledge Bases`
- `API Keys`

### KB admin routes

When the user is operating inside a knowledge base, the shell should expose a KB group:

- `KB Overview`
- `Users & Roles`
- `Tags`
- `Import`

The KB group should be clearly attached to a selected KB context, including KB name and slug in the top bar.

### Navigation model

Use one dedicated admin workspace with a persistent left rail on desktop and a collapsible sheet on mobile.

The shell should support moving between:

- global admin pages
- a selected KB admin context

without changing the overall frame or visual language.

## Shared Shell

### Left rail

The left rail is the persistent anchor for the admin workspace.

Requirements:

- compact icon plus label navigation
- strong active state
- clear grouping between global sections and KB-scoped sections
- room for a KB selector or selected-KB summary
- visually darker and more structural than the content area

### Top context bar

The top context bar should orient the user and expose the most important action.

Contents:

- page title
- short description
- breadcrumb or scope line
- KB identity when in KB admin
- one or two primary actions only

Examples:

- global overview: `Create Knowledge Base`
- users page: `Manage Users`
- API keys page: `Create API Key`
- KB import page: `Import Content`

### Main content grid

The content region should follow the same top-level pattern across admin pages:

1. metric strip
2. quick actions and recent activity
3. page-specific manager surface

This keeps the shell consistent even when page bodies differ substantially.

## Page Design

### Global overview: `/admin`

Purpose:

- summarize cross-system state
- surface high-value entry points
- show recent global activity

Top metrics:

- total users
- role mix: admins, editors, viewers
- total knowledge bases
- active API keys

Quick actions:

- create knowledge base
- manage users
- create API key

Activity feed:

- mixed system activity across users, KBs, keys, and articles

### Users: `/admin/users`

Purpose:

- support user lookup and role management with stronger context

Additions above the existing table:

- total user count
- role distribution summary
- one prominent shortcut for user management actions if an invite flow exists later

The table remains the primary work surface.

### Knowledge bases: `/admin/knowledge-bases`

Purpose:

- treat KBs as managed system objects rather than a simple list

Additions:

- total KB count
- create KB action in the header
- activity snippets relevant to KB lifecycle and article activity
- richer KB rows/cards with metadata and direct entry into KB admin

### API keys: `/admin/api-keys`

Purpose:

- clarify operational state of keys without changing the create and revoke workflow

Additions:

- total active keys
- revoked count
- recent key usage summary only if existing data is already available and reliable; otherwise omit it in the first pass
- create-key action in the header

The existing create form and table remain primary.

### KB overview: `/kb/[kbSlug]/admin`

Purpose:

- provide a scoped control surface for one knowledge base

Top metrics:

- KB user overrides or assigned users
- tag count
- recent imports
- recent article activity

Quick actions:

- manage KB users
- manage tags
- import content

Activity feed:

- only events tied to the current KB

### KB users, tags, and import pages

These pages should reuse the same shell and top summary band, but keep their current managers as the main body content.

This means:

- the shell gives orientation, metrics, and shortcuts
- the existing manager component still handles the core workflow

## Visual Direction

The admin workspace should feel like a modern operations console, not a marketing page and not a neutral default SaaS template.

### Brand constraints

Apply the installed `mla-branding` skill constraints:

- use MLA colors, logo rules, and typography roles
- keep the experience professional, calm, and accessible
- avoid decorative gradients, glows, and novelty chrome

### Recommended styling

- dark or deep structural surfaces for the left rail and admin framing
- lighter panels for work surfaces and tables
- stronger contrast between navigation chrome and content panels
- compact cards with small labels and large numeric values
- crisp borders and badges
- operational, scannable tables

### Typography

- `DM Sans` for major headings, nav labels, metric values, and actions
- `Archivo` for table text, metadata, timestamps, filters, and activity rows
- `Cardo` used sparingly, if at all, in admin surfaces

### Color roles

- `#094A6B` Deep Blue as the structural anchor
- `#5C6E85` Slate Blue-Gray for secondary chrome
- `#5B8DE0` Bright Blue and `#007A6B` Teal as restrained action/status accents
- danger colors reserved for destructive actions

### Responsive behavior

- desktop: persistent left rail
- mobile: left rail collapses into a sheet or drawer
- metrics stack into a compact grid
- recent activity moves below shortcuts before the main manager surface

## Data Model

### Metrics

Metrics should be lightweight aggregates assembled from existing data rather than a new analytics system.

Global metrics:

- total users
- user role counts
- total KBs
- active API keys

KB metrics:

- users with KB-specific roles or access
- tag count
- recent imports
- recent article creation/edit activity

Each metric card may include a short supporting line if a reliable derived value is available.

### Activity feed

The UI should normalize events into one display shape even if the backend assembles them from different tables or endpoints.

Required event types in the first pass:

- `user.created`
- `user.deleted`
- `user.role_changed`
- `kb.created`
- `kb.deleted`
- `api_key.created`
- `api_key.revoked`
- `article.created`
- `article.edited`

Required display fields:

- actor: the user who performed the activity
- subject: the target entity or content item
- KB context when applicable
- timestamp
- optional metadata for readable summaries such as old and new role

Example rendered lines:

- `Jane Smith changed Alex Lee from editor to admin`
- `Sam Patel created API key "LibreChat Prod"`
- `Maya Chen edited "Tenant Eviction Timeline" in Housing`

### Scope behavior

- global admin pages show mixed activity across all KBs
- KB admin pages filter the feed to the current KB

## Backend Strategy

Start with pragmatic aggregation.

Potential first-pass sources:

- user records and role update history if already captured
- knowledge base create/delete operations
- API key create/revoke timestamps and creator identity
- article create/update metadata
- import records where available

If some event types are not reliably derivable today, the UI should still accept a sparse feed rather than block the shell rollout. The event model should be shaped so a future dedicated audit log can replace the aggregation layer without changing the UI contract.

## Component Plan

Create a small set of reusable UI components for the admin shell:

- `AdminWorkspaceLayout`
- `AdminNav`
- `AdminSectionHeader`
- `AdminMetricStrip`
- `AdminQuickActions`
- `AdminActivityFeed`

Page-level routes should compose these components around existing managers rather than duplicate layout logic.

## Loading, Empty, and Error States

- keep the shell visible while data loads
- show skeletons or placeholder cards in metrics and activity panels
- localize failures to the panel that failed rather than collapsing the whole page
- empty activity should still feel intentional, with copy such as `No recent admin activity`
- empty manager states should keep the related shortcut visible

## Rollout Plan

### Phase 1

- build shared admin shell
- apply it to `/admin` and `/kb/[kbSlug]/admin`
- establish shared visual language and navigation

### Phase 2

- migrate `/admin/users`, `/admin/knowledge-bases`, and `/admin/api-keys` into the shell
- add metric strips and action areas above existing manager components

### Phase 3

- implement lightweight activity aggregation
- render global and KB-scoped feeds

### Phase 4

- refine loading, empty, and mobile states
- tighten table density, badges, and summary copy

## Validation

The implementation should be validated with targeted checks:

- route-level UI verification for `/admin`
- route-level UI verification for `/admin/users`
- route-level UI verification for `/admin/knowledge-bases`
- route-level UI verification for `/admin/api-keys`
- route-level UI verification for `/kb/[slug]/admin`
- mobile and desktop spot checks for the shared shell

Where practical, add focused tests for any new data-shaping helpers used for metrics or activity normalization.

## Risks And Follow-Up

- Some activity types may not have enough existing metadata to show actor plus timestamp cleanly in the first pass.
- A new shared shell can accidentally add too much chrome if metrics, actions, and activity are not kept tight.
- The KB and global contexts must stay visually similar without making scoped actions ambiguous.
- If the shell becomes too dark or too stylized, it may drift from the MLA brand’s calm, trustworthy tone.

If first-pass aggregation proves too thin, the next follow-up should be a dedicated admin event pipeline that preserves the same UI contract.
