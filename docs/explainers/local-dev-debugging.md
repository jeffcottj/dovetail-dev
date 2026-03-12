# Local Development And Debugging Guide

This guide explains how to set up and use Dovetail's local development environment for day-to-day debugging work.

It assumes you want the fastest practical local loop:

- PostgreSQL in Docker
- The API and web app running locally with hot reload
- Known-good seeded data
- A dev-only local login path so you can debug the UI without external OAuth
- A repeatable smoke test you can rerun after changes

If you are new to local debugging, use this guide as your default workflow.

---

## What This Local Workflow Gives You

After setup, you will have:

- A single command to prepare the local environment
- Three seeded local users you can sign in as
- A one-command database reset
- A way to tail database logs while the apps run locally
- A smoke test that verifies the core app flow against your local stack

The default local workflow does **not** require Google or Microsoft login setup. Production OAuth still exists, but local debugging no longer depends on it.

---

## Prerequisites

Install these tools on your machine first:

### 1. Node.js and pnpm

Use Node 20+ and pnpm 9+.

Check what you have installed:

```bash
node --version
pnpm --version
```

### 2. Docker with Compose

Docker is used for the local PostgreSQL container.

Check that Docker is installed and the daemon is running:

```bash
docker --version
docker compose version
docker compose ps
```

If `docker compose ps` fails, fix Docker access before moving on.

### 3. just

This repo now uses a `Justfile` for the local debug workflow.

Install `just`, then confirm it works:

```bash
just --version
```

### 4. Repository Dependencies

From the repo root:

```bash
pnpm install
```

---

## First-Time Setup

From the repo root:

```bash
just setup
```

What this does:

- Creates `.env` from `.env.example` if you do not already have one
- Verifies local prerequisites with `just doctor`
- Starts Postgres in Docker
- Applies database migrations
- Loads deterministic seed data

If you want to inspect the checks without changing anything first, run:

```bash
just doctor
```

---

## Seeded Local Login

Local debugging uses a dev-only login flow when `DEV_AUTH_ENABLED=true`.

That is enabled by default in `.env.example`.

Once the web app is running, go to:

```text
http://localhost:3000/login
```

You will see three seeded users:

- `Local Admin`
- `Local Editor`
- `Local Viewer`

These map to deterministic seeded records in the database. Use them when reproducing auth, role, UI, and permissions issues locally.

### Seeded Data Snapshot

The seed includes:

- Three users: admin, editor, viewer
- A category tree: `Housing` -> `Evictions`
- A published article: `Notice Requirements for Evictions`
- A draft article: `Eviction Intake Checklist Draft`
- A tag: `Intake`
- A fixed local RAG API key for optional AI smoke checks

This gives you a stable dataset for debugging search, roles, admin screens, and content flows.

---

## Daily Workflow

### 1. Start local development

```bash
just dev
```

This starts:

- Postgres in Docker
- Migrations
- Seed data
- All workspace `dev` processes with watch mode

That last point matters: shared packages like `packages/db` and `packages/types` are watched too, so local changes there do not silently drift from the running apps.

### 2. Sign in with a seeded user

Open `http://localhost:3000/login` and choose the user that matches the role you want to debug.

### 3. Reproduce the bug locally

Write down:

- The exact URL
- The seeded user you used
- The actions you took
- What happened
- What should have happened instead

This becomes your repro recipe.

### 4. Watch logs while you debug

The web and API logs appear in the `just dev` terminal.

If you want database logs too, use a second terminal:

```bash
just logs-db
```

If you need to see everything in containers instead, use:

```bash
just stack
```

or:

```bash
just stack-logs
```

Use the full Docker stack only when you need container-level behavior. For most debugging, the hybrid mode is faster.

---

## Resetting The Database

When local data gets messy or you want to start from a known-good state again, run:

```bash
just db-reset
```

This is destructive. It:

- Stops the local compose stack
- Removes the Postgres volume
- Starts a fresh Postgres container
- Reapplies migrations
- Reseeds the database

If you only need to reload the known-good seed data without wiping the volume, run:

```bash
just seed
```

Use `just db-reset` when schema/data state is suspect. Use `just seed` when the schema is already fine and you just want clean content again.

---

## Smoke Testing

After setup, reset, or a code change, run:

```bash
just smoke
```

This is a repeatable read-only smoke check against the running local stack. It verifies:

- API health
- Dev login
- Authenticated home page load
- Current user identity
- Categories endpoint
- Published articles endpoint
- Full-text search
- Admin dashboard access for the seeded admin

If you also want semantic search and RAG validation, and your embedding configuration is available, run:

```bash
just smoke-ai
```

That path is optional. It is intentionally separate so the baseline local workflow does not depend on external AI services.

---

## Suggested Debug Routine

For bug work, use this loop:

1. `just dev`
2. Sign in as the smallest role that reproduces the bug
3. Reproduce the issue and write the steps down
4. Inspect the first failing layer:
   browser UI, Next.js, API, or database
5. Make the smallest fix
6. Rerun the original repro
7. Run `just smoke`

If the bug touches data state, start with `just db-reset` before reproducing it.

---

## Common Problems

### `just doctor` says Docker is not accessible

Your Docker daemon is not running, or your shell user cannot talk to it.

Fix Docker first, then rerun:

```bash
just doctor
```

### `just smoke` fails on login

Check that `DEV_AUTH_ENABLED=true` is present in `.env`.

Then restart the apps:

```bash
just dev
```

### Shared package changes are not showing up

Use `just dev`, not an old ad hoc app-only startup command. The local workflow relies on all workspace watchers running together.

### You want to start over completely

Use:

```bash
just db-reset
```

Then rerun:

```bash
just smoke
```

### Ports 3000, 3001, or 5432 are busy

Run:

```bash
just doctor
```

If the ports are occupied by old dev processes, stop them and rerun `just dev`.

---

## Quick Reference

```bash
just setup       # First-time local setup
just doctor      # Check prerequisites and local env health
just dev         # Start Postgres + local watch processes
just db-reset    # Recreate the DB from scratch and reseed
just seed        # Reload known-good seed data
just logs-db     # Tail Postgres logs
just smoke       # Repeatable core smoke test
just smoke-ai    # Optional AI smoke test
```

If you are unsure what to do next, start with `just doctor`, then `just setup`, then `just dev`.
