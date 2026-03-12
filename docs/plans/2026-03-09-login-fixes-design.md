# Login & Landing Page Fixes — Design

**Date:** 2026-03-09

## Problems

1. **Root URL shows "coming soon"** — `apps/web/app/page.tsx` renders a placeholder landing page. The `(main)/page.tsx` route group already provides the authenticated home page, and middleware already redirects unauthenticated users to `/login`.

2. **Login page is unstyled** — The sign-in button is a bare `<button>` with no Tailwind classes. No visual design applied.

3. **"Cannot GET /auth/signin" on sign-in click** — The login page passes `process.env.OAUTH_PROVIDER` (value: `'entra'`) directly to Auth.js `signIn()`, but the provider is registered as `'microsoft-entra-id'`. Auth.js can't find a provider named `'entra'` and redirects to a default sign-in page that doesn't exist.

## Solutions

### 1. Remove landing page

Delete `apps/web/app/page.tsx`. The `(main)/page.tsx` already serves `/` for authenticated users, and middleware redirects unauthenticated users to `/login`.

### 2. Restyle login page

Redesign `apps/web/app/login/page.tsx` using the existing editorial design system:

- Vertically and horizontally centered card on parchment background
- Playfair Display for the heading, DM Sans for UI elements
- Sign-in button with Microsoft logo (inline SVG) and label "Sign in with Microsoft"
- Brown accent color scheme, subtle border and shadow
- No mention of "Entra" in user-facing text

### 3. Fix OAuth provider ID mapping

Map the `OAUTH_PROVIDER` env var to the correct Auth.js provider ID. When `OAUTH_PROVIDER === 'entra'`, pass `'microsoft-entra-id'` to `signIn()`.
