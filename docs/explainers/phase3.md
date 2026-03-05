# Phase 3: Authentication — What We Built and Why

This document explains what was accomplished in Phase 3 of the Dovetail project, written for a non-technical audience.

## What is Phase 3?

Phase 3 is where users get an identity. Before this phase, Dovetail had a running database and server, but anyone could talk to it — there was no concept of "who is asking." After Phase 3, every request is tied to a real person, and the system knows who that person is and what permissions they have.

## What We Built

### 1. OAuth Login via Google or Microsoft (`apps/web/auth.ts`)

We integrated **Auth.js** (the most widely used authentication library for Next.js) to handle the login process. When a user clicks "Sign in," Auth.js redirects them to their organisation's identity provider — either Google or Microsoft Entra — and handles the entire back-and-forth exchange that proves who they are.

The choice of provider (Google or Microsoft) is controlled by a single environment variable (`OAUTH_PROVIDER`). No code changes are needed to switch between them.

**Why OAuth instead of passwords?** OAuth means Dovetail never sees or stores anyone's password. The identity provider (Google, Microsoft) does all the work of verifying the user's identity. This is significantly more secure and means users don't have to create or remember another password.

**Why this matters:** Users can sign in with the account they already use at work. Administrators don't have to manage passwords, resets, or lockouts.

### 2. Login Page and Route Protection (`apps/web/app/login/page.tsx`, `apps/web/middleware.ts`)

We added a login page at `/login` with a single "Sign in" button, and a **middleware** — a piece of code that runs automatically before every page request — that redirects any unauthenticated user to that login page.

This means no page in Dovetail is accessible without logging in first. The middleware is set up to allow the login flow itself through (and static assets like images), while protecting everything else.

**Why this matters:** No configuration is needed to protect new pages as they are added. Every route is private by default.

### 3. Session Token (`apps/web/auth.ts`)

After a successful login, Auth.js creates a **JWT** (JSON Web Token) — a small, cryptographically signed piece of data that proves the user's identity — and stores it in an HTTP-only cookie in the user's browser. This cookie is sent automatically with every subsequent request.

The token includes the user's ID and their role (viewer, editor, or admin). Because the token is **signed** using a secret key, it cannot be forged or tampered with.

**Why a signed token, not a database session?** Database sessions require a round-trip to the database on every request to verify the session. A signed JWT can be verified instantly by any service that knows the secret key — including the Express API — without touching the database. This makes the system faster and simpler to scale.

### 4. API Authentication Middleware (`apps/api/src/middleware/auth.ts`)

We added a middleware to the Express API that reads the JWT from the incoming request (either from the cookie or from an `Authorization` header), verifies its signature, and — if valid — attaches the user's identity to the request so route handlers know who is asking.

If no token is present, the API returns **401 Unauthorized**. If a token is present but invalid or expired, it also returns 401.

**Why this matters:** Every API route that needs to know who the user is can now simply read `req.user` — the middleware has already done the verification work. This logic lives in one place, so it cannot be accidentally skipped.

### 5. `/api/me` Endpoint

We added a simple endpoint that returns the currently authenticated user's identity. This is useful for the frontend to confirm who is logged in, and is also a convenient way for developers to verify that authentication is working correctly.

### 6. Automated Tests

We wrote tests that verify the auth middleware behaves correctly under two conditions:
- A request with **no token** correctly returns 401
- A request with a **valid signed token** correctly returns 200 with the user's identity

These tests run without a real OAuth provider or database — they create test tokens directly using the same signing algorithm. This means authentication logic can be tested instantly in any environment.

## What's Next

Phase 4 adds **RBAC** (role-based access control): the system will enforce not just that you are logged in, but that you have the right level of permission for what you are trying to do. Viewers will be able to read; editors will be able to write; admins will have full control — and those rules will cascade through the category hierarchy.
