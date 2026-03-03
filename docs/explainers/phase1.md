# Phase 1: Scaffold — What We Built and Why

This document explains what was accomplished in Phase 1 of the Dovetail project, written for a non-technical audience.

## What is Phase 1?

Phase 1 is the foundation. Before we can build any features — login, articles, search — we need a solid structure for the codebase to live in. Think of it like pouring a concrete slab before constructing a building. Nothing visible to users happens here, but everything that comes later depends on it.

## What We Set Up

### 1. The Monorepo (Workspace Root)

Dovetail is made up of several interconnected pieces: a web app users visit in their browser, a behind-the-scenes API server that handles data, and shared code used by both. Rather than managing these as completely separate projects, we organized them into a single repository called a **monorepo** — one place where all the code lives together.

We set up tooling (using a package manager called pnpm) that lets developers run commands across all pieces at once. For example, a single `pnpm test` command runs every test in the entire project.

**Why this matters:** Keeping everything in one place makes it much easier to make changes that span multiple parts of the system — and reduces the chance that one part gets out of sync with another.

### 2. Shared Type Definitions (`packages/types`)

Both the web app and the API server need to agree on what data looks like. For example, what fields does a "User" have? What does an "Article" look like? We created a shared library that defines these structures once.

**Why this matters:** If the API sends a field that the web app doesn't expect, or vice versa, bugs are caught automatically before the code even runs. This prevents an entire category of errors.

### 3. Database Package Scaffold (`packages/db`)

We created a placeholder for the code that will talk to the database. The actual database tables and data come in Phase 2 — but setting up this placeholder now means all the wiring between the database and the rest of the app is ready to go.

**Why this matters:** Getting the connections between pieces right early prevents painful restructuring later.

### 4. The API Server (`apps/api`)

We created the Express API server — the backend that will handle all requests for data (fetching articles, checking permissions, running searches, etc.). At this stage, it has just one working endpoint: a health check at `/health` that returns `{"status": "ok"}`.

We also wrote the first automated test: a test that calls `/health` and verifies it gets the right response back. This test will run automatically on every future code change.

**Why this matters:** The health check is how monitoring tools (and developers) verify the server is alive and responding. Starting with a passing test establishes the testing habit from day one.

### 5. The Web App (`apps/web`)

We created the Next.js web application — the frontend that users will see in their browser. Right now it shows a single page with "Dovetail — Legal knowledge base — coming soon." The structure is in place for all future pages to be added.

**Why this matters:** Having a running app, even a minimal one, means we can see real changes in a browser as we build. It also confirms the web app and API server start up and connect correctly.

### 6. Docker Compose (Local Database)

We configured Docker Compose — a tool that runs the PostgreSQL database in an isolated container on a developer's machine. This means every developer gets an identical, clean database environment without needing to install PostgreSQL manually.

**Why this matters:** "Works on my machine" is one of the most common causes of bugs and wasted time in software projects. Docker ensures the database behaves the same for everyone.

## What's Next

Phase 2 will define the actual database tables — users, categories, articles, version history, and embeddings for search — and run the first migrations to create those tables in the database.
