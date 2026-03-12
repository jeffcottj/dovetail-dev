# Login & Landing Page Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the placeholder landing page, fix the broken OAuth sign-in flow, and restyle the login page to match the editorial design system.

**Architecture:** Three independent fixes in the Next.js frontend (`apps/web/`). No API or database changes needed. The middleware, auth config, and route group structure remain unchanged.

**Tech Stack:** Next.js 15 (App Router), Auth.js v5, Tailwind CSS v4 with custom theme

**Design doc:** `docs/plans/2026-03-09-login-fixes-design.md`

---

### Task 1: Remove the placeholder landing page

**Files:**
- Delete: `apps/web/app/page.tsx`

**Step 1: Delete the landing page**

Delete `apps/web/app/page.tsx`. The route group `(main)/page.tsx` already serves `/` for authenticated users. The middleware in `apps/web/middleware.ts` already redirects unauthenticated users from `/` to `/login`.

**Step 2: Verify the route group serves `/`**

Confirm `apps/web/app/(main)/page.tsx` exists and renders the authenticated home page (it does — it shows "Welcome to Dovetail" with the user's name).

**Step 3: Commit**

```bash
git add -u apps/web/app/page.tsx
git commit -m "fix: remove placeholder landing page

Unauthenticated users are redirected to /login by middleware.
Authenticated users see the (main) dashboard at /."
```

---

### Task 2: Fix OAuth provider ID mapping in login page

**Files:**
- Modify: `apps/web/app/login/page.tsx`

**Step 1: Identify the bug**

In `apps/web/app/login/page.tsx:10`, `signIn(process.env.OAUTH_PROVIDER ?? 'google')` passes `'entra'` when `OAUTH_PROVIDER=entra`. But Auth.js registers the Entra provider with ID `'microsoft-entra-id'` (from `next-auth/providers/microsoft-entra-id`). Auth.js can't find the provider and redirects to `/auth/signin`, which doesn't exist.

**Step 2: Fix the provider ID mapping**

In `apps/web/app/login/page.tsx`, map the env var to the correct Auth.js provider ID:

```tsx
const providerId =
  (process.env.OAUTH_PROVIDER ?? 'google') === 'entra'
    ? 'microsoft-entra-id'
    : 'google';
await signIn(providerId);
```

**Step 3: Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "fix: map OAUTH_PROVIDER to correct Auth.js provider ID

When OAUTH_PROVIDER=entra, pass 'microsoft-entra-id' to signIn()
instead of 'entra'. Fixes 'Cannot GET /auth/signin' error."
```

---

### Task 3: Restyle the login page

**Files:**
- Modify: `apps/web/app/login/page.tsx`

**Step 1: Redesign the login page**

Replace the contents of `apps/web/app/login/page.tsx` with a styled version using the editorial design system. Key design elements:

- Full-viewport centered layout (`min-h-screen flex items-center justify-center`)
- Card with parchment-warm background, subtle border, and shadow
- Playfair Display heading: "Sign in to Dovetail"
- Subtitle in Source Serif: "Legal knowledge base"
- Sign-in button with:
  - Microsoft logo as inline SVG (the standard 4-square logo)
  - Label: "Sign in with Microsoft"
  - Brown accent background (`bg-accent`) with hover state (`hover:bg-accent-hover`)
  - White text, rounded corners, DM Sans font
- Horizontal rule separating heading from button
- Footer text: subtle "Secured with Microsoft Entra ID" or similar in muted text (optional, uses "Microsoft" branding)

```tsx
import { signIn } from '../../auth';

const providerId =
  (process.env.OAUTH_PROVIDER ?? 'google') === 'entra'
    ? 'microsoft-entra-id'
    : 'google';

const providerLabel =
  providerId === 'microsoft-entra-id' ? 'Microsoft' : 'Google';

function MicrosoftLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-sm">
        <div className="bg-parchment-warm border border-border-light rounded-lg shadow-sm p-8">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink text-center tracking-tight">
            Dovetail
          </h1>
          <p className="text-ink-muted text-sm text-center mt-1 font-[family-name:var(--font-ui)]">
            Legal Knowledge Base
          </p>

          <hr className="border-border-light my-6" />

          <form
            action={async () => {
              'use server';
              await signIn(providerId);
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-accent hover:bg-accent-hover text-white font-[family-name:var(--font-ui)] font-medium py-2.5 px-4 rounded-md transition-colors cursor-pointer"
            >
              {providerId === 'microsoft-entra-id' ? <MicrosoftLogo /> : <GoogleLogo />}
              Sign in with {providerLabel}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "feat: restyle login page with editorial design system

Centered card layout with Playfair Display heading, Microsoft logo
button, and parchment color scheme. Also supports Google provider."
```

---

### Task 4: Rebuild and verify in Docker

**Step 1: Rebuild the web container**

```bash
docker compose up --build web -d
```

**Step 2: Verify all three fixes**

1. Navigate to `https://dovetail-dev.mdlab.org/` — should redirect to `/login`
2. Login page should show styled card with Microsoft sign-in button
3. Clicking "Sign in with Microsoft" should initiate the OAuth flow (no "Cannot GET" error)
