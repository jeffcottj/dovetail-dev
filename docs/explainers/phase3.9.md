# Phase 3.9: Cross-Cutting Prerequisites — What We Built and Why

This document explains what was accomplished in Phase 3.9 of the Dovetail project, written for a non-technical audience.

## What is Phase 3.9?

Phase 3.9 is a preparation step. Before building the main features (articles, categories, search), we established shared patterns and utilities that every subsequent phase relies on. Think of it as laying down the plumbing before building the rooms.

## What We Built

### 1. Shared Test Token Helper (`apps/api/src/__tests__/helpers/token.ts`)

In Phase 3 we wrote tests that create fake authentication tokens. Phase 3.9 moved that logic into a shared helper file so that every future test can create test tokens without duplicating code. This means tests across the entire API can simulate authenticated users (viewers, editors, admins) consistently.

**Why this matters:** Without a shared helper, every test file would copy-paste the same token-creation code. If the token format ever changes, we'd need to update dozens of files instead of one.

### 2. Global Error Handler (`apps/api/src/app.ts`)

We added a catch-all error handler at the bottom of the Express app. If any route handler throws an unexpected error, this handler catches it, logs the details for developers, and returns a clean "Internal server error" message to the user — instead of crashing the server or leaking technical details.

**Why this matters:** Without this, a single unhandled error in any route could crash the entire API server, taking the application offline for all users.

### 3. Input Validation Utilities (`apps/api/src/utils/validate.ts`)

We created middleware functions that check incoming data against a schema before it reaches the route handler. If someone sends a request with missing fields, wrong types, or invalid values, the validation catches it and returns a clear 400 error explaining what went wrong.

We use a library called **Zod** for defining these schemas. Each route declares exactly what shape of data it expects, and Zod enforces those rules automatically.

**Why this matters:** Without validation, invalid data could slip through and cause confusing errors deep in the system — or worse, corrupt the database.

### 4. Pagination Utilities (`apps/api/src/utils/pagination.ts`)

Any endpoint that returns a list (articles, categories, versions) uses the same pagination pattern: the client sends `?page=1&limit=20`, and the server returns a consistent envelope with `data`, `total`, `page`, and `limit`. This utility standardises that pattern so every list endpoint behaves the same way.

**Why this matters:** Consistent pagination makes the frontend simpler — one component can handle any list, regardless of what type of data it shows.

### 5. Slug Generation (`apps/api/src/utils/slug.ts`)

A **slug** is a URL-friendly version of a name: "Housing Law Resources" becomes `housing-law-resources`. The slug utility converts any text into a clean, lowercase, hyphenated string suitable for use in URLs.

**Why this matters:** Slugs make URLs human-readable and SEO-friendly. Having a single function for slug generation ensures all slugs follow the same rules.

### 6. Test Database Strategy

We documented how to handle database mocking in tests. Since test environments don't have a real database connection, we use Vitest's mocking system to replace the database layer with fake responses. This allows tests to run instantly without needing a running Postgres instance.

**Why this matters:** Fast, reliable tests that don't depend on external services mean developers can run the test suite confidently at any time.

## What's Next

Phase 4 builds on these utilities to implement role-based access control (RBAC), and Phase 5 uses them to build the core article and category API endpoints.
