# Phase 2: Database Schema & Migrations — What We Built and Why

This document explains what was accomplished in Phase 2 of the Dovetail project, written for a non-technical audience.

## What is Phase 2?

Phase 2 is where we design and build the database — the place where all of Dovetail's information is permanently stored. Think of it like designing the filing cabinets and folders before you start putting documents in them. After Phase 2, the database is ready to hold users, articles, categories, version history, and search data.

## What We Set Up

### 1. The Database Schema (`packages/db/src/schema.ts`)

A **schema** is a blueprint that describes exactly what information the database will store, and how it is organised. We defined eight tables:

- **users** — everyone who can log in: their name, email, role (viewer, editor, or admin), and which login provider they used.
- **categories** — the folders articles are organised into. Categories can be nested inside one another (a category can have a parent category), creating a tree structure like a filing system.
- **user_category_roles** — sometimes a person should have different permissions in different parts of the knowledge base. This table stores those exceptions, so an editor in one category might only be a viewer in another.
- **articles** — the actual content: title, body, status (draft, published, or archived), and which category and author it belongs to.
- **article_versions** — every time an article is saved, the old version is preserved here. This gives Dovetail a complete edit history and the ability to roll back to any earlier version.
- **tags** — labels that can be attached to articles for cross-cutting topics (e.g. "contract law", "compliance").
- **article_tags** — the link between articles and their tags (an article can have many tags; a tag can apply to many articles).
- **article_embeddings** — stores mathematical representations of article content that make semantic (meaning-based) search possible. Each article is broken into overlapping text chunks and each chunk gets a numerical fingerprint called an **embedding**.

We also set up three **enums** — fixed lists of allowed values — for roles (`viewer`, `editor`, `admin`), login providers (`google`, `entra`), and article statuses (`draft`, `published`, `archived`). Using enums means the database itself rejects any invalid value before it can cause a problem.

**Why this matters:** A well-designed schema prevents a huge category of bugs. If the code tries to store something in the wrong shape — for example, an article without an author — the database refuses and reports an error. Rules enforced at this level are much more reliable than rules scattered throughout application code.

### 2. The Database Connection (`packages/db/src/connection.ts`)

We created the code that actually opens a connection from the application to the database. It reads a `DATABASE_URL` environment variable (set when the application starts) to know where the database lives and how to authenticate. This connection is shared across the entire API server, so every request can query the database without each one opening its own connection.

**Why this matters:** A shared, reusable connection is more efficient and avoids running out of database connections under load. Reading the address from an environment variable (rather than hard-coding it) means the same code works in development, staging, and production without modification.

### 3. Drizzle Configuration (`packages/db/drizzle.config.ts`)

We added a configuration file that tells Drizzle ORM (the library we use to talk to the database) where to find the schema and where to write migration files. This configuration is what makes the `db:generate` and `db:migrate` commands work.

**Why this matters:** Having a single config file as the source of truth avoids mistakes that come from typing database settings in multiple places.

### 4. The Migration (`packages/db/migrations/`)

A **migration** is a versioned SQL file that records exactly what changes need to be made to the database. Rather than manually running SQL commands, migrations are run automatically and tracked so the system always knows what state the database is in.

We generated the first migration from the schema (a single command compared the TypeScript schema to the empty database and wrote the required SQL) and applied it. The migration created all eight tables and enabled the `pgvector` extension — the Postgres add-on that makes storing and searching embeddings possible.

**Why this matters:** Migrations make the database reproducible. Any developer, or any server in any environment, can start from an empty database and run `pnpm db:migrate` to get an identical, up-to-date database in seconds. Migrations also provide a safe, reviewable record of every change ever made to the database structure.

### 5. The Connection Test (`packages/db/src/__tests__/connection.test.ts`)

We wrote an automated test that actually connects to a real running database, inserts a user row, reads it back, confirms the values are correct, and then cleans up after itself. This test runs as part of the project's test suite.

**Why this matters:** This test catches two categories of problem: bugs in the database schema (for example, a column with the wrong type) and configuration errors (for example, a missing environment variable or a wrong database address). Having this test means any future change that accidentally breaks database connectivity will be caught immediately.

## What's Next

Phase 3 adds authentication — users will be able to log in via Google or Microsoft Entra, and the API will verify their identity on every request.
