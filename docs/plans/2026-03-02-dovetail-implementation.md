# Dovetail Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a legal knowledge base platform with hierarchical content, version history, OAuth, RBAC, full-text and semantic search, and a RAG API for LLM integration.

**Architecture:** pnpm monorepo with `apps/web` (Next.js) and `apps/api` (Express). Shared `packages/types` and `packages/db`. PostgreSQL with pgvector. Auth.js v5 handles OAuth; Express middleware enforces RBAC. Each phase produces working, testable software.

**Tech Stack:** Next.js 15, Express 5, TypeScript 5, Drizzle ORM, postgres.js 3, Auth.js v5, pgvector, pnpm 9, Docker Compose, Vitest 2

---

## Phase 1: Scaffold

> **Goal:** A running skeleton — Postgres starts in Docker, the API serves a health check, and the web app loads a page. No business logic yet.

---

### Task 1.1: Initialize workspace root

> **Why:** pnpm workspaces let you manage multiple packages (apps, shared libs) from a single root. Commands at the root cascade to all packages. `tsconfig.base.json` sets TypeScript rules once so every package inherits the same standards.

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `tsconfig.base.json`

**Step 1: Create `package.json`**

```json
{
  "name": "dovetail",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter './apps/*' --parallel dev",
    "build": "pnpm --filter './packages/*' build && pnpm --filter './apps/*' build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  }
}
```

**Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 4: Create `.gitignore`**

```
node_modules/
dist/
.next/
.env
*.local
.DS_Store
```

**Step 5: Run install**

```bash
pnpm install
```

Expected: `Done in [x]s` with no errors.

**Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore
git commit -m "chore: initialize pnpm workspace root"
```

---

### Task 1.2: Create packages/types

> **Why:** Shared TypeScript interfaces live here. Both `apps/web` and `apps/api` import from this package so they always agree on the shape of data. If one side sends a field the other doesn't expect, TypeScript will catch it at build time — before it becomes a runtime bug.

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`

**Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@dovetail/types",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/types/src/index.ts`**

```typescript
export type Role = 'viewer' | 'editor' | 'admin';
export type OAuthProvider = 'google' | 'entra';
export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  provider: OAuthProvider;
  createdAt: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  createdAt: Date;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  authorId: string;
  content: unknown; // rich text JSON (Tiptap format)
  status: ArticleStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface ArticleVersion {
  id: string;
  articleId: string;
  title: string;
  content: unknown;
  authorId: string;
  versionNumber: number;
  createdAt: Date;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}
```

**Step 4: Install and build**

```bash
cd packages/types && pnpm install && pnpm build
```

Expected: `dist/` folder created with `.js` and `.d.ts` files.

**Step 5: Commit**

```bash
git add packages/types/
git commit -m "chore: add @dovetail/types package"
```

---

### Task 1.3: Create packages/db scaffold

> **Why:** Drizzle schema and database migrations live here as a shared package. In Phase 2 we fill in the actual schema. The scaffold lets `apps/api` declare a dependency on it now, so the import wiring is ready when we need it.

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`

**Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@dovetail/db",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Create `packages/db/src/index.ts` (stub)**

```typescript
// Schema, connection, and migrations added in Phase 2.
export {};
```

**Step 4: Install and build**

```bash
cd packages/db && pnpm install && pnpm build
```

**Step 5: Commit**

```bash
git add packages/db/
git commit -m "chore: add @dovetail/db package scaffold"
```

---

### Task 1.4: Create apps/api scaffold

> **Why:** Express is the HTTP server that handles all API requests. `tsx` gives us hot reload in development (re-runs on file save without a manual restart). Vitest is our test runner — it's faster than Jest and has first-class TypeScript support. `supertest` lets tests make real HTTP requests against the Express app without needing a running server.

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/__tests__/health.test.ts`

**Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@dovetail/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@dovetail/db": "workspace:*",
    "@dovetail/types": "workspace:*",
    "cors": "^2.8.5",
    "express": "^5.0.0",
    "helmet": "^8.0.0",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/morgan": "^1.9.9",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 3: Create `apps/api/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

**Step 4: Create `apps/api/src/app.ts`**

```typescript
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
```

**Step 5: Create `apps/api/src/index.ts`**

```typescript
import { app } from './app.js';

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
```

**Step 6: Write the failing test first**

Create `apps/api/src/__tests__/health.test.ts`:

```typescript
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../app.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const response = await supertest(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
```

**Step 7: Install dependencies**

```bash
cd apps/api && pnpm install
```

**Step 8: Run test — should pass**

```bash
cd apps/api && pnpm test
```

Expected output:
```
✓ src/__tests__/health.test.ts > GET /health > returns 200 with status ok
Test Files  1 passed (1)
Tests       1 passed (1)
```

**Step 9: Start dev server and verify manually**

```bash
cd apps/api && pnpm dev
```

In a separate terminal:

```bash
curl http://localhost:3001/health
```

Expected: `{"status":"ok"}`

**Step 10: Commit**

```bash
git add apps/api/
git commit -m "feat: add Express API scaffold with health check"
```

---

### Task 1.5: Create apps/web scaffold

> **Why:** Next.js 15 uses the App Router — a folder-based routing system where each folder under `app/` maps to a URL path. `layout.tsx` wraps all pages (like a master template). `page.tsx` is the content for that route. The `tsconfig.json` here uses `"moduleResolution": "Bundler"` instead of `NodeNext` because Next.js uses webpack/Turbopack internally, not Node's module system.

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`

**Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@dovetail/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "@dovetail/types": "workspace:*",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create `apps/web/next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:3001',
  },
};

export default nextConfig;
```

**Step 4: Create `apps/web/app/layout.tsx`**

```tsx
export const metadata = {
  title: 'Dovetail',
  description: 'Legal knowledge base',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

**Step 5: Create `apps/web/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Dovetail</h1>
      <p>Legal knowledge base — coming soon.</p>
    </main>
  );
}
```

**Step 6: Install dependencies**

```bash
cd apps/web && pnpm install
```

**Step 7: Start dev server**

```bash
cd apps/web && pnpm dev
```

Open browser to `http://localhost:3000`. Expected: Page renders "Dovetail" heading.

**Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat: add Next.js web app scaffold"
```

---

### Task 1.6: Configure Docker Compose

> **Why:** `docker-compose.yml` describes all services (Postgres, API, web) and how they connect. The `healthcheck` on Postgres makes the API wait until the database is actually ready before starting — without it, the API might crash on boot because Postgres isn't ready yet. In development, we only run Postgres in Docker; the apps run via `pnpm dev` for instant hot reload.

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-dovetail}
      POSTGRES_USER: ${POSTGRES_USER:-dovetail}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dovetail}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-dovetail}"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-dovetail}:${POSTGRES_PASSWORD:-dovetail}@postgres:5432/${POSTGRES_DB:-dovetail}
      PORT: 3001
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      API_URL: http://api:3001
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  postgres_data:
```

**Step 2: Create `.env.example`**

```env
# Database
POSTGRES_DB=dovetail
POSTGRES_USER=dovetail
POSTGRES_PASSWORD=dovetail
POSTGRES_PORT=5432
DATABASE_URL=postgres://dovetail:dovetail@localhost:5432/dovetail

# OAuth — fill in the provider you're using
OAUTH_PROVIDER=google
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# ENTRA_CLIENT_ID=
# ENTRA_TENANT_ID=
# ENTRA_CLIENT_SECRET=

# Auth
NEXTAUTH_SECRET=change-me-in-production
NEXTAUTH_URL=http://localhost:3000

# Embeddings
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_API_KEY=
# EMBEDDING_BASE_URL=

# RAG API
RAG_API_KEY=change-me
```

**Step 3: Copy to .env**

```bash
cp .env.example .env
```

Leave OAuth and embedding keys blank for now — they're filled in during Phase 3 and Phase 8.

**Step 4: Start Postgres**

```bash
docker compose up postgres -d
```

Expected: Container starts and becomes healthy.

**Step 5: Verify**

```bash
docker compose ps
```

Expected: `postgres` row shows state `healthy`.

**Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add Docker Compose with Postgres"
```

---

## Phase 2: Database Schema & Migrations

> **Goal:** All tables exist in Postgres. A migration file captures the schema so it can be applied to any environment reproducibly. A connection test confirms the app can talk to the database.

---

### Task 2.1: Define Drizzle schema

> **Why:** Drizzle is an ORM (Object Relational Mapper) — it lets you define your database tables as TypeScript objects and generates SQL from them. The schema file is the single source of truth for your database structure.

**Files:**
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/src/connection.ts`
- Create: `packages/db/drizzle.config.ts`
- Modify: `packages/db/src/index.ts`

**Step 1: Create `packages/db/src/connection.ts`**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

**Step 2: Create `packages/db/src/schema.ts`**

```typescript
import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  customType,
} from 'drizzle-orm/pg-core';

// -- Enums --

export const roleEnum = pgEnum('role', ['viewer', 'editor', 'admin']);
export const providerEnum = pgEnum('oauth_provider', ['google', 'entra']);
export const statusEnum = pgEnum('article_status', ['draft', 'published', 'archived']);

// -- Vector type for pgvector --

const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${(config as { dimensions: number }).dimensions})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  },
});

// -- Tables --

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').notNull().default('viewer'),
  provider: providerEnum('provider').notNull(),
  providerId: text('provider_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  parentId: uuid('parent_id'),  // references categories.id — added below via relations
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userCategoryRoles = pgTable(
  'user_category_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  authorId: uuid('author_id').notNull().references(() => users.id),
  content: jsonb('content').notNull().default({}),
  status: statusEnum('status').notNull().default('draft'),
  searchVector: text('search_vector'),  // managed by Postgres trigger, text placeholder
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  publishedAt: timestamp('published_at'),
});

export const articleVersions = pgTable('article_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: jsonb('content').notNull(),
  authorId: uuid('author_id').notNull().references(() => users.id),
  versionNumber: integer('version_number').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const articleTags = pgTable(
  'article_tags',
  {
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

export const articleEmbeddings = pgTable('article_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  chunkText: text('chunk_text').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// -- Relations (for Drizzle's query builder) --

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  articles: many(articles),
  userRoles: many(userCategoryRoles),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  category: one(categories, { fields: [articles.categoryId], references: [categories.id] }),
  author: one(users, { fields: [articles.authorId], references: [users.id] }),
  versions: many(articleVersions),
  articleTags: many(articleTags),
  embeddings: many(articleEmbeddings),
}));
```

**Step 3: Create `packages/db/drizzle.config.ts`**

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

**Step 4: Update `packages/db/src/index.ts`**

```typescript
export { db } from './connection.js';
export * from './schema.js';
```

**Step 5: Commit**

```bash
git add packages/db/
git commit -m "feat: define Drizzle schema for all tables"
```

---

### Task 2.2: Generate and run migrations

> **Why:** A migration is a versioned SQL file that transforms the database from one state to another. Running migrations is how you apply your schema to a real database — and how you'll update it safely in production later.

**Step 1: Make sure Postgres is running**

```bash
docker compose up postgres -d
```

**Step 2: Generate migration from schema**

```bash
cd packages/db && DATABASE_URL=postgres://dovetail:dovetail@localhost:5432/dovetail pnpm db:generate
```

Expected: `migrations/` folder created with a `.sql` file.

**Step 3: Inspect the migration file**

Open the generated `.sql` file and read it. You'll see `CREATE TABLE` statements for each table you defined. This is the raw SQL Drizzle generated from your TypeScript schema.

**Step 4: Apply the migration**

```bash
cd packages/db && DATABASE_URL=postgres://dovetail:dovetail@localhost:5432/dovetail pnpm db:migrate
```

Expected: `All migrations applied successfully.`

**Step 5: Verify in Drizzle Studio (optional)**

```bash
cd packages/db && DATABASE_URL=postgres://dovetail:dovetail@localhost:5432/dovetail pnpm db:studio
```

Open the URL shown in the terminal. You'll see your tables in a visual browser.

**Step 6: Commit**

```bash
git add packages/db/migrations/ packages/db/drizzle.config.ts
git commit -m "feat: add initial database migration"
```

---

### Task 2.3: Test the database connection

> **Why:** A connection test confirms the app can talk to the database — catching misconfiguration before it becomes a mysterious runtime failure.

**Files:**
- Create: `packages/db/src/__tests__/connection.test.ts`

**Step 1: Write the test**

```typescript
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../connection.js';
import { users } from '../schema.js';

describe('database connection', () => {
  it('can insert and retrieve a user', async () => {
    const [inserted] = await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User',
      role: 'viewer',
      provider: 'google',
      providerId: 'google-test-123',
    }).returning();

    expect(inserted.email).toBe('test@example.com');
    expect(inserted.role).toBe('viewer');

    // Clean up
    await db.delete(users).where(eq(users.id, inserted.id));
  });
});
```

Add `import { eq } from 'drizzle-orm';` at the top.

**Step 2: Add vitest config to packages/db**

Create `packages/db/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

Add `"test": "vitest run"` to `packages/db/package.json` scripts. Add `"vitest": "^2.1.0"` to devDependencies.

**Step 3: Run test**

```bash
cd packages/db && DATABASE_URL=postgres://dovetail:dovetail@localhost:5432/dovetail pnpm test
```

Expected: `✓ can insert and retrieve a user`

**Step 4: Commit**

```bash
git add packages/db/
git commit -m "test: add database connection test"
```

---

## Phase 3: Authentication

> **Goal:** Users can log in via Google or Entra (configured by env var). On first login, a user row is created in the database. The Express API validates the session on every protected request.

---

### Task 3.1: Install Auth.js in apps/web

> **Why:** Auth.js (NextAuth v5) handles the entire OAuth handshake — redirecting to Google/Entra, receiving the callback, creating a session, and setting a cookie. Without it, you'd have to implement OAuth from scratch, which involves several complex security steps.

**Files:**
- Create: `apps/web/auth.ts`
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/web/middleware.ts`

**Step 1: Install Auth.js and Drizzle adapter**

```bash
cd apps/web && pnpm add next-auth@beta @auth/drizzle-adapter
```

**Step 2: Create `apps/web/auth.ts`**

```typescript
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import EntraId from 'next-auth/providers/microsoft-entra-id';
import Google from 'next-auth/providers/google';
import { db } from '@dovetail/db';

const provider = process.env.OAUTH_PROVIDER ?? 'google';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers:
    provider === 'entra'
      ? [
          EntraId({
            clientId: process.env.ENTRA_CLIENT_ID!,
            clientSecret: process.env.ENTRA_CLIENT_SECRET!,
            tenantId: process.env.ENTRA_TENANT_ID!,
          }),
        ]
      : [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ],
  callbacks: {
    session({ session, user }) {
      // Attach role to session so the frontend and API can use it
      session.user.role = (user as { role?: string }).role ?? 'viewer';
      return session;
    },
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role ?? 'viewer';
      return token;
    },
  },
  session: { strategy: 'jwt' },
});
```

**Step 3: Create `apps/web/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from '../../../../auth';

export const { GET, POST } = handlers;
```

**Step 4: Create `apps/web/middleware.ts`**

```typescript
import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url));
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**Step 5: Create login page `apps/web/app/login/page.tsx`**

```tsx
import { signIn } from '../../auth';

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in to Dovetail</h1>
      <form
        action={async () => {
          'use server';
          await signIn(process.env.OAUTH_PROVIDER ?? 'google');
        }}
      >
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
```

**Step 6: Add NEXTAUTH_SECRET to .env**

```bash
openssl rand -base64 32
```

Copy the output into `.env` as `NEXTAUTH_SECRET=<output>`.

**Step 7: Add OAuth credentials to .env**

For Google: create a project at console.cloud.google.com, enable Google OAuth, add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI, and paste `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env`.

**Step 8: Start the web app and test login**

```bash
cd apps/web && pnpm dev
```

Navigate to `http://localhost:3000`. Should redirect to `/login`. Click "Sign in". Should complete OAuth flow and redirect back.

**Step 9: Commit**

```bash
git add apps/web/
git commit -m "feat: add Auth.js OAuth with Google/Entra support"
```

---

### Task 3.2: Auth middleware for Express API

> **Why:** Every API request needs to identify who is making it. The middleware reads the JWT from the cookie, verifies it, and attaches the user to `req` so route handlers know who they're dealing with — without repeating this logic in every handler.

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/__tests__/middleware/auth.test.ts`

**Step 1: Install JWT library**

```bash
cd apps/api && pnpm add jose
```

**Step 2: Write the failing test**

Create `apps/api/src/__tests__/middleware/auth.test.ts`:

```typescript
import { SignJWT } from 'jose';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app.js';

const secret = new TextEncoder().encode('test-secret');

async function makeToken(payload: object) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

describe('auth middleware', () => {
  it('returns 401 with no token', async () => {
    const res = await supertest(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const token = await makeToken({ sub: 'user-1', role: 'viewer' });
    const res = await supertest(app)
      .get('/api/me')
      .set('Cookie', `next-auth.session-token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
  });
});
```

**Step 3: Run test — should fail**

```bash
cd apps/api && pnpm test
```

Expected: FAIL — `/api/me` route does not exist yet.

**Step 4: Implement `apps/api/src/middleware/auth.ts`**

```typescript
import { jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? 'dev-secret');

export interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.['next-auth.session-token']
    ?? req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    req.user = { id: payload.sub as string, role: (payload.role as string) ?? 'viewer' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Step 5: Add `/api/me` route and cookie parser to `apps/api/src/app.ts`**

```bash
cd apps/api && pnpm add cookie-parser && pnpm add -D @types/cookie-parser
```

Add to `app.ts`:

```typescript
import cookieParser from 'cookie-parser';
import { authMiddleware } from './middleware/auth.js';

// after existing middleware:
app.use(cookieParser());

app.get('/api/me', authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});
```

**Step 6: Run test — should pass**

```bash
cd apps/api && pnpm test
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add apps/api/
git commit -m "feat: add JWT auth middleware with /api/me endpoint"
```

---

## Phase 3.9: Cross-Cutting Prerequisites

> **Goal:** Establish patterns and utilities needed by all remaining phases. Must be completed before Phase 4.

---

### Task 3.9.1: Extract shared test token helper

> **Why:** The JWE token helper (`makeToken`, `getDerivedKey`) in `apps/api/src/__tests__/middleware/auth.test.ts` is needed by every authenticated test in Phases 4–10. It's currently local to one test file.

**Files:**
- Create: `apps/api/src/__tests__/helpers/token.ts`
- Edit: `apps/api/src/__tests__/middleware/auth.test.ts`

**Step 1: Create `apps/api/src/__tests__/helpers/token.ts`**

```typescript
import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { EncryptJWT } from 'jose';

const hkdfAsync = promisify(hkdf);

export const TEST_SECRET = 'test-secret';
export const COOKIE_NAME = 'authjs.session-token';

async function getDerivedKey(secret: string, salt: string): Promise<Uint8Array> {
  const buf = await hkdfAsync('sha256', secret, salt, `Auth.js Generated Encryption Key (${salt})`, 64);
  return new Uint8Array(buf as ArrayBuffer);
}

export async function makeToken(payload: Record<string, unknown>) {
  const key = await getDerivedKey(TEST_SECRET, COOKIE_NAME);
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
    .setExpirationTime('1h')
    .encrypt(key);
}
```

**Step 2: Refactor `apps/api/src/__tests__/middleware/auth.test.ts`**

Remove the local `getDerivedKey`, `makeToken`, `TEST_SECRET`, and `COOKIE_NAME` definitions. Replace with:

```typescript
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { COOKIE_NAME, makeToken, TEST_SECRET } from '../helpers/token.js';
```

**Step 3: Run tests to verify refactor**

```bash
cd apps/api && pnpm test
```

---

### Task 3.9.2: Add global error handler and route registration pattern

> **Why:** Express 5 catches async errors but returns unhelpful responses without a global error handler. Route files need a consistent registration pattern.

**Files:**
- Edit: `apps/api/src/app.ts`

**Step 1: Add global error handler to `app.ts`**

Add at the end of `app.ts` (after all route registrations):

```typescript
import type { NextFunction, Request, Response } from 'express';

// Global error handler — must be added after all routes
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

**Route registration pattern (used by all subsequent phases):**

Each route file must:
1. Create an `express.Router()`
2. Define routes on it
3. Export the router

Then in `app.ts`, import and mount it:

```typescript
import { categoriesRouter } from './routes/categories.js';
app.use('/api/categories', categoriesRouter);
```

All route imports and `app.use()` calls go above the global error handler.

---

### Task 3.9.3: Install zod and create validation/pagination utilities

> **Why:** Route handlers need input validation (zod) and all list endpoints need consistent pagination.

**Files:**
- Edit: `apps/api/package.json` (add zod dependency)
- Create: `apps/api/src/utils/validate.ts`
- Create: `apps/api/src/utils/pagination.ts`
- Create: `apps/api/src/utils/slug.ts`

**Step 1: Install zod**

```bash
pnpm --filter @dovetail/api add zod
```

**Step 2: Create `apps/api/src/utils/validate.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  };
}
```

**Step 3: Create `apps/api/src/utils/pagination.ts`**

Standard pagination pattern used by all list endpoints:
- Query params: `?page=1&limit=20`
- Response envelope: `{ data: T[], total: number, page: number, limit: number }`
- Default limit: 20, max limit: 100

```typescript
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function paginate<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  return { data, total, page: params.page, limit: params.limit };
}
```

**Step 4: Create `apps/api/src/utils/slug.ts`**

```typescript
export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

**Step 5: Run tests and commit**

```bash
cd apps/api && pnpm test
git add .
git commit -m "feat: add cross-cutting prerequisites (test helper, error handler, validation, pagination, slug utils)"
```

---

### Task 3.9.4: Test database strategy

> **Why:** Tests that transitively import `@dovetail/db` will fail because `DATABASE_URL` is unset and the connection module throws at import time. Every test file needs a clear mocking strategy.

**Strategy for all subsequent phases:**

- **Service/middleware unit tests:** Use `vi.mock('@dovetail/db', ...)` factory mock (hoisted above imports, prevents the real module from loading). Use a **partial mock** that preserves schema exports:

```typescript
vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return { ...actual, db: { execute: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() } };
});
```

This prevents the real `DATABASE_URL` check from running while preserving all schema exports (tables, enums, relations) needed by the code under test.

- **Route integration tests (supertest):** Mock DB at the top of the test file using the same pattern. All database calls return mocked data.

---

## Phase 4: RBAC

> **Goal:** Role-based access control enforced in Express. Category-level overrides (with cascade to subcategories) resolve correctly.

---

### Task 4.1: Permission resolution service

> **Why:** The cascade logic — "walk up ancestor chain, take most specific role, fall back to global" — is complex enough to deserve its own tested service, separate from HTTP concerns.

**Files:**
- Create: `apps/api/src/services/permissions.ts`
- Create: `apps/api/src/__tests__/services/permissions.test.ts`

**Step 1: Write the failing tests**

Note: Use a partial mock so schema exports are preserved. The mock replaces only `db`, preventing the `DATABASE_URL` check from running.

```typescript
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

// Partial mock — preserves schema exports, replaces only db
vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return { ...actual, db: { execute: vi.fn() } };
});

import { resolveRole, hasMinimumRole } from '../../services/permissions.js';
import { db } from '@dovetail/db';

describe('resolveRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns global role when no category override exists', async () => {
    (db.execute as Mock).mockResolvedValue([]);
    const role = await resolveRole('user-1', 'cat-1', 'viewer');
    expect(role).toBe('viewer');
  });

  it('returns category role when exact match exists', async () => {
    (db.execute as Mock).mockResolvedValue([{ role: 'editor' }]);
    const role = await resolveRole('user-1', 'cat-1', 'viewer');
    expect(role).toBe('editor');
  });

  it('returns the most specific (deepest) category role', async () => {
    // The SQL orders by depth ASC and LIMITs 1, so the first result is the deepest match
    (db.execute as Mock).mockResolvedValue([{ role: 'admin' }]);
    const role = await resolveRole('user-1', 'cat-child', 'viewer');
    expect(role).toBe('admin');
  });
});

describe('hasMinimumRole', () => {
  it('viewer meets viewer requirement', () => {
    expect(hasMinimumRole('viewer', 'viewer')).toBe(true);
  });
  it('viewer does not meet editor requirement', () => {
    expect(hasMinimumRole('viewer', 'editor')).toBe(false);
  });
  it('admin meets editor requirement', () => {
    expect(hasMinimumRole('admin', 'editor')).toBe(true);
  });
});
```

**Step 2: Implement `apps/api/src/services/permissions.ts`**

```typescript
import { db } from '@dovetail/db';
import { sql } from 'drizzle-orm';
import type { Role } from '@dovetail/types';

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/**
 * Resolve the effective role for a user in the context of a category.
 * Walks up the category ancestor chain via recursive CTE.
 * Most-specific (deepest) category role wins; falls back to global role.
 */
export async function resolveRole(
  userId: string,
  categoryId: string,
  globalRole: Role,
): Promise<Role> {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 0 AS depth
      FROM categories
      WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c.parent_id, a.depth + 1
      FROM categories c
      INNER JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT ucr.role
    FROM ancestors a
    INNER JOIN user_category_roles ucr
      ON ucr.category_id = a.id AND ucr.user_id = ${userId}
    ORDER BY a.depth ASC
    LIMIT 1
  `);

  if (result.length > 0) {
    return result[0].role as Role;
  }

  return globalRole;
}

export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
```

**Step 3: Run tests**

```bash
cd apps/api && pnpm test
```

Expected: All permission resolution tests pass.

**Step 4: Commit**

```bash
git add apps/api/src/services/ apps/api/src/__tests__/services/
git commit -m "feat: add category-level RBAC permission resolution"
```

---

### Task 4.2: requireRole middleware

> **Why:** Coarse-grained global-role gate for routes. Per-category RBAC is handled in route handlers by calling `resolveRole()` after fetching the resource (to know its `categoryId`).

**Files:**
- Create: `apps/api/src/middleware/requireRole.ts`
- Create: `apps/api/src/__tests__/middleware/requireRole.test.ts`

**Step 1: Write failing test**

Test the middleware in isolation (mock req/res/next):

```typescript
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { requireRole } from '../../middleware/requireRole.js';
import type { AuthRequest } from '../../middleware/auth.js';

describe('requireRole', () => {
  function callMiddleware(role: string, minimum: string) {
    const req = { user: { id: 'u1', role } } as AuthRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();
    requireRole(minimum as any)(req, res, next);
    return { req, res, next };
  }

  it('returns 403 for viewer on editor route', () => {
    const { res, next } = callMiddleware('viewer', 'editor');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows editor on editor route', () => {
    const { next } = callMiddleware('editor', 'editor');
    expect(next).toHaveBeenCalled();
  });

  it('allows admin on editor route', () => {
    const { next } = callMiddleware('admin', 'editor');
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when no user on request', () => {
    const req = {} as AuthRequest;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();
    requireRole('viewer')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
```

**Step 2: Implement `requireRole.ts`**

```typescript
import type { NextFunction, Response } from 'express';
import type { Role } from '@dovetail/types';
import type { AuthRequest } from './auth.js';
import { hasMinimumRole } from '../services/permissions.js';

/**
 * Coarse-grained role gate based on the user's global role.
 * For per-category RBAC, call resolveRole() in the route handler itself
 * (after fetching the resource to know its categoryId).
 */
export function requireRole(minimum: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role as Role | undefined;
    if (!userRole || !hasMinimumRole(userRole, minimum)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
```

**Step 3: Run tests and commit**

```bash
cd apps/api && pnpm test
git add apps/api/src/middleware/requireRole.ts apps/api/src/__tests__/middleware/requireRole.test.ts
git commit -m "feat: add requireRole middleware"
```

---

## Phase 5: Core API — Articles & Categories

> **Goal:** Full CRUD for categories and articles. Every save creates a version row. Routes are protected by auth + role middleware. All route files follow the router pattern from Task 3.9.2.

---

### Task 5.1: Category routes

**Files:**
- Create: `apps/api/src/routes/categories.ts`
- Create: `apps/api/src/__tests__/routes/categories.test.ts`
- Edit: `apps/api/src/app.ts` (mount router)

**Endpoints:**

```
GET    /api/categories          → list all (flat array with parentId — frontend builds tree), viewer+
POST   /api/categories          → create, editor+
PATCH  /api/categories/:id      → update, editor+
DELETE /api/categories/:id      → delete (409 if has children or articles), admin only
```

**Route file skeleton:**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, categories, articles } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';

export const categoriesRouter = Router();

const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

categoriesRouter.get('/', authMiddleware, async (req, res) => {
  const result = await db.select().from(categories);
  res.json(result); // flat list — frontend builds tree from parentId
});

categoriesRouter.post('/', authMiddleware, requireRole('editor'), validateBody(createCategorySchema), async (req, res) => {
  const { name, parentId } = req.body;
  const slug = toSlug(name);
  // Handle slug collision: append random suffix on uniqueness violation
  try {
    const [created] = await db.insert(categories).values({ name, slug, parentId: parentId ?? null }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === '23505' && err.constraint_name?.includes('slug')) {
      const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
      const [created] = await db.insert(categories).values({ name, slug: uniqueSlug, parentId: parentId ?? null }).returning();
      res.status(201).json(created);
    } else {
      throw err;
    }
  }
});

categoriesRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  // Refuse to delete categories with children or articles (return 409)
  const [childCount] = await db.select({ count: sql<number>`count(*)` }).from(categories).where(eq(categories.parentId, id));
  if (childCount.count > 0) {
    res.status(409).json({ error: 'Cannot delete category with subcategories. Move or delete them first.' });
    return;
  }
  const [articleCount] = await db.select({ count: sql<number>`count(*)` }).from(articles).where(eq(articles.categoryId, id));
  if (articleCount.count > 0) {
    res.status(409).json({ error: 'Cannot delete category with articles. Move or delete them first.' });
    return;
  }
  await db.delete(categories).where(eq(categories.id, id));
  res.status(204).end();
});
```

**Mount in `app.ts`:**

```typescript
import { categoriesRouter } from './routes/categories.js';
app.use('/api/categories', categoriesRouter);
// Keep global error handler LAST
```

**Slug generation:** Uses `utils/slug.ts`. On uniqueness violation (Postgres error code `23505`), retries with a timestamp suffix.

**Deletion strategy:** Categories with children or articles cannot be deleted (returns 409 Conflict). Children/articles must be moved or deleted first.

**Test pattern:** Use supertest with JWE tokens from the shared helper. Mock `@dovetail/db` using the partial mock pattern from Task 3.9.4.

Write failing tests first. Implement routes. Mount router. Run tests. Commit.

---

### Task 5.2: Article routes

**Files:**
- Create: `apps/api/src/routes/articles.ts`
- Create: `apps/api/src/__tests__/routes/articles.test.ts`
- Edit: `apps/api/src/app.ts` (mount router)

**Endpoints:**

```
GET    /api/articles               → list (filter by status, category, pagination), viewer+
GET    /api/articles/:id           → get one, viewer+
GET    /api/articles/by-slug/:slug → get by slug (for frontend routing), viewer+
POST   /api/articles               → create draft, editor+
PATCH  /api/articles/:id           → update (creates version), editor of category+
DELETE /api/articles/:id           → archive (sets status to 'archived'), editor+
POST   /api/articles/:id/publish   → publish, editor+
```

**Important: Versioning requires a database transaction.**

Concurrent updates could produce duplicate version numbers. Use Drizzle transactions:

```typescript
import { db, articles, articleVersions } from '@dovetail/db';
import { eq, sql } from 'drizzle-orm';

// PATCH /api/articles/:id handler:
await db.transaction(async (tx) => {
  // 1. Fetch current article
  const [current] = await tx.select().from(articles).where(eq(articles.id, id));
  if (!current) { res.status(404).json({ error: 'Article not found' }); return; }

  // 2. Compute next version number from article_versions (not from articles table — articles has no versionNumber column)
  const [maxVersion] = await tx
    .select({ max: sql<number>`coalesce(max(version_number), 0)` })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, id));
  const nextVersion = (maxVersion?.max ?? 0) + 1;

  // 3. Insert version row with the CURRENT content (before update)
  await tx.insert(articleVersions).values({
    articleId: id,
    title: current.title,
    content: current.content,
    authorId: req.user!.id,
    versionNumber: nextVersion,
  });

  // 4. Apply update to articles — must explicitly set updatedAt (defaultNow only applies on INSERT)
  await tx.update(articles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(articles.id, id));
});
```

**Per-category RBAC check:**

PATCH requires "editor of category+". The handler must call `resolveRole()` after fetching the article:

```typescript
import { resolveRole, hasMinimumRole } from '../services/permissions.js';

// Inside PATCH handler, after fetching current article:
const effectiveRole = await resolveRole(req.user!.id, current.categoryId, req.user!.role as Role);
if (!hasMinimumRole(effectiveRole, 'editor')) {
  res.status(403).json({ error: 'Forbidden' });
  return;
}
```

**`updatedAt` note:** The schema has `updatedAt: timestamp('updated_at').notNull().defaultNow()` — this only sets the default on INSERT. The PATCH handler must explicitly set `updatedAt: new Date()`.

**Archive semantics:** `DELETE /api/articles/:id` sets `status: 'archived'` (soft delete) and returns 200 with the archived article. It does NOT return 204 or physically delete the row.

**Slug-based lookup:** `GET /api/articles/by-slug/:slug` enables frontend routing by slug while the API primarily uses IDs.

Write failing tests (mock DB, use JWE tokens from shared helper). Implement. Mount router in `app.ts`. Run tests. Commit.

---

### Task 5.3: Version history routes

**Files:**
- Create: `apps/api/src/routes/versions.ts` (or add to `articles.ts`)
- Create: `apps/api/src/__tests__/routes/versions.test.ts`

**Endpoints:**

```
GET  /api/articles/:id/versions              → list versions (paginated), viewer+
GET  /api/articles/:id/versions/:versionId   → get version snapshot, viewer+
POST /api/articles/:id/versions/:versionId/restore → restore old version, editor+
```

**Restore logic (requires a transaction):**

Restoring a version means: take the old version's content, create a NEW version row (snapshot of current content), then overwrite the article with the old content.

```typescript
// POST /api/articles/:id/versions/:versionId/restore
await db.transaction(async (tx) => {
  // 1. Fetch the old version to restore
  const [oldVersion] = await tx.select().from(articleVersions)
    .where(eq(articleVersions.id, versionId));
  if (!oldVersion) { res.status(404).json({ error: 'Version not found' }); return; }

  // 2. Fetch current article content
  const [current] = await tx.select().from(articles).where(eq(articles.id, articleId));
  if (!current) { res.status(404).json({ error: 'Article not found' }); return; }

  // 3. Compute next version number
  const [maxVersion] = await tx
    .select({ max: sql<number>`coalesce(max(version_number), 0)` })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId));
  const nextVersion = (maxVersion?.max ?? 0) + 1;

  // 4. Save current content as a new version
  await tx.insert(articleVersions).values({
    articleId,
    title: current.title,
    content: current.content,
    authorId: req.user!.id,
    versionNumber: nextVersion,
  });

  // 5. Overwrite article with old version's content
  await tx.update(articles).set({
    title: oldVersion.title,
    content: oldVersion.content,
    updatedAt: new Date(),
  }).where(eq(articles.id, articleId));
});
```

Write failing tests. Implement. Run. Commit.

---

## Phase 6: Frontend

> **Goal:** Next.js pages for browsing, reading, and editing articles. Role-aware UI (editors see edit buttons; viewers don't).

---

### Task 6.0: Frontend prerequisites

> **Why:** Several infrastructure pieces must be in place before building UI components: API client with cookie forwarding, session provider for role-aware UI, and a styling solution.

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/app/providers.tsx`
- Edit: `apps/web/app/layout.tsx`
- Edit: `apps/web/package.json` (add dependencies)

**Step 1: Install Tailwind CSS**

```bash
cd apps/web && pnpm add -D tailwindcss @tailwindcss/postcss postcss
```

Create `apps/web/postcss.config.mjs`:
```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```

Create `apps/web/app/globals.css`:
```css
@import "tailwindcss";
```

Import `globals.css` in `layout.tsx`.

**Step 2: Create API client with cookie forwarding**

Server components cannot access browser cookies directly. Use `cookies()` from `next/headers`:

```typescript
// apps/web/lib/api.ts
import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get('authjs.session-token')?.value;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { Cookie: `authjs.session-token=${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
```

**Note:** This `apiFetch` is for **server components only** (uses `next/headers`). For **client components** (e.g., the editor), use plain `fetch` with `credentials: 'include'` — the browser will send the cookie automatically.

Create a client-side API helper:

```typescript
// apps/web/lib/api-client.ts
'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiClientFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}
```

**Step 3: Add SessionProvider for role-aware client UI**

`useSession()` requires `<SessionProvider>` in the component tree.

```typescript
// apps/web/app/providers.tsx
'use client';

import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

**Step 4: Update layout.tsx**

```tsx
// apps/web/app/layout.tsx
import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Dovetail',
  description: 'Legal knowledge base',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 5: Add `NEXT_PUBLIC_API_URL` and `API_URL` to `.env.example`**

```
API_URL=http://localhost:3001          # server-side API calls
NEXT_PUBLIC_API_URL=http://localhost:3001  # client-side API calls
```

Commit.

---

### Task 6.1: Category tree sidebar and page layout

**Files:**
- Create: `apps/web/components/Sidebar.tsx`
- Create: `apps/web/app/(main)/layout.tsx`

The `(main)` route group wraps all authenticated pages with a sidebar + main content area layout.

```tsx
// apps/web/app/(main)/layout.tsx
import { Sidebar } from '../../components/Sidebar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

`Sidebar.tsx` fetches `/api/categories` via `apiFetch` (server component), renders a collapsible tree using recursive components. Links navigate to `/categories/[slug]`.

Add `loading.tsx` in the `(main)` route group for a loading skeleton.

---

### Task 6.2: Article list page

**Files:**
- Create: `apps/web/app/(main)/categories/[slug]/page.tsx`
- Create: `apps/web/app/(main)/categories/[slug]/loading.tsx`
- Create: `apps/web/app/(main)/categories/[slug]/error.tsx`

Server component. Uses `apiFetch` to fetch articles in that category. Lists titles, author, updated date, status badge.

---

### Task 6.3: Article view page

**Files:**
- Create: `apps/web/app/(main)/articles/[slug]/page.tsx`
- Create: `apps/web/app/(main)/articles/[slug]/loading.tsx`
- Create: `apps/web/app/(main)/articles/[slug]/error.tsx`

Uses `apiFetch` to fetch article by slug via `GET /api/articles/by-slug/:slug`.

**Rendering Tiptap JSON:** Use a read-only Tiptap editor instance as a **client component**:

```tsx
// apps/web/components/ArticleContent.tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export function ArticleContent({ content }: { content: unknown }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content as any,
    editable: false,
  });
  return <EditorContent editor={editor} />;
}
```

Shows metadata. Uses `useSession()` to check role — editor+ sees "Edit" button.

---

### Task 6.4: Article editor

**Files:**
- Create: `apps/web/app/(main)/articles/[slug]/edit/page.tsx`
- Create: `apps/web/components/ArticleEditor.tsx`

**Step 1: Install Tiptap**

```bash
cd apps/web && pnpm add @tiptap/react @tiptap/starter-kit @tiptap/pm
```

**Step 2: Build editor component**

Client component using `useEditor` with `editable: true`. Uses `apiClientFetch` (client-side) for save/publish.

Save button calls `PATCH /api/articles/:id` with `credentials: 'include'`.
Publish button calls `POST /api/articles/:id/publish`.

---

### Task 6.5: Version history page

**Files:**
- Create: `apps/web/app/(main)/articles/[slug]/history/page.tsx`
- Create: `apps/web/app/(main)/articles/[slug]/history/loading.tsx`

Lists versions fetched via `apiFetch`. Links to version snapshot view. Editor+ can restore (calls `POST /api/articles/:id/versions/:versionId/restore`).

---

## Phase 7: Full-Text Search

> **Goal:** `GET /api/search?q=...` returns ranked articles. Postgres does the heavy lifting.

---

### Task 7.1: Add tsvector trigger and GIN index via migration

> **Why:** A `tsvector` is a preprocessed, indexed version of text that Postgres can search extremely fast. The trigger keeps it in sync automatically.

**Critical note:** The article `content` column is JSONB (Tiptap format). Casting JSONB to text with `content::text` produces raw JSON structure, not readable text. A generated column approach will produce garbage search indexes.

**Solution:** Use a PL/pgSQL trigger function that extracts text from Tiptap JSON, plus a `plain_text` column that caches extracted text.

**Files:**
- Create: `packages/db/migrations/NNNN_add_search_trigger.sql` (manual migration)
- Edit: `packages/db/src/schema.ts` (update `searchVector` column type, add `plainText`)
- Edit: `packages/db/migrations/meta/_journal.json` (register the manual migration)

**Step 1: Update Drizzle schema**

In `packages/db/src/schema.ts`, change the `articles` table:
- Remove `searchVector: text('search_vector')` (the text placeholder)
- Add `plainText: text('plain_text')` — application-populated on save, contains extracted text from Tiptap JSON

The `search_vector` tsvector column will be managed by Postgres trigger and should NOT be in the Drizzle schema (it's a generated column the app never reads/writes directly).

**Step 2: Create a Tiptap text extraction utility**

```typescript
// apps/api/src/utils/tiptap.ts

/**
 * Recursively extracts plain text from Tiptap JSON content.
 * Walks the node tree and concatenates all text node values.
 */
export function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;

  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text;
  }

  if (Array.isArray(n.content)) {
    return n.content.map(extractText).join(' ');
  }

  return '';
}
```

This utility is also used in Phase 8 (embedding pipeline).

**Step 3: Update article save handlers (PATCH and POST)**

After saving an article, compute and store `plain_text`:

```typescript
import { extractText } from '../utils/tiptap.js';

// In the PATCH handler, after updating the article:
const plainText = extractText(updates.content ?? current.content);
await tx.update(articles).set({ plainText }).where(eq(articles.id, id));
```

**Step 4: Create manual SQL migration**

Create `packages/db/migrations/NNNN_add_search_trigger.sql`:

```sql
-- Add plain_text column for extracted article text
ALTER TABLE articles ADD COLUMN IF NOT EXISTS plain_text text;

-- Drop the old search_vector text column and recreate as tsvector
ALTER TABLE articles DROP COLUMN IF EXISTS search_vector;

-- Add tsvector column managed by trigger
ALTER TABLE articles ADD COLUMN search_vector tsvector;

-- Create trigger function to update search_vector from title + plain_text
CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.plain_text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, plain_text ON articles
  FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS articles_search_idx ON articles USING GIN(search_vector);
```

**Step 5: Register in journal**

Add an entry to `packages/db/migrations/meta/_journal.json` following the pattern of existing entries (increment the index, use the migration filename without `.sql`).

**Step 6: Apply migration**

```bash
cd packages/db && DATABASE_URL=... pnpm db:migrate
```

---

### Task 7.2: Search endpoint

**Files:**
- Create: `apps/api/src/routes/search.ts`
- Create: `apps/api/src/__tests__/routes/search.test.ts`
- Edit: `apps/api/src/app.ts` (mount router)

```
GET /api/search?q=...&categoryId=...&authorId=...&from=...&to=...&tags=...&page=1&limit=20
```

**Critical:** Use `websearch_to_tsquery` (NOT `to_tsquery`). `to_tsquery` requires pre-formatted boolean syntax (`word1 & word2`). `websearch_to_tsquery` accepts natural language queries with quotes and `-` for exclusion.

**Dynamic WHERE clause building with Drizzle:**

```typescript
import { and, eq, gte, lte, sql } from 'drizzle-orm';

const conditions = [];

if (q) {
  conditions.push(sql`search_vector @@ websearch_to_tsquery('english', ${q})`);
}
if (categoryId) {
  conditions.push(eq(articles.categoryId, categoryId));
}
if (authorId) {
  conditions.push(eq(articles.authorId, authorId));
}
if (from) {
  conditions.push(gte(articles.createdAt, new Date(from)));
}
if (to) {
  conditions.push(lte(articles.createdAt, new Date(to)));
}

// Only show published articles in search
conditions.push(eq(articles.status, 'published'));

const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

const results = await db
  .select({
    id: articles.id,
    title: articles.title,
    slug: articles.slug,
    categoryId: articles.categoryId,
    authorId: articles.authorId,
    status: articles.status,
    createdAt: articles.createdAt,
    updatedAt: articles.updatedAt,
    rank: q ? sql<number>`ts_rank(search_vector, websearch_to_tsquery('english', ${q}))` : sql<number>`1`,
  })
  .from(articles)
  .where(whereClause)
  .orderBy(q ? sql`ts_rank(search_vector, websearch_to_tsquery('english', ${q})) DESC` : articles.updatedAt)
  .limit(limit)
  .offset((page - 1) * limit);
```

Write failing test. Implement. Mount at `app.use('/api/search', searchRouter)`. Run. Commit.

---

### Task 7.3: Search UI

**Files:**
- Create: `apps/web/app/(main)/search/page.tsx`
- Create: `apps/web/components/SearchBar.tsx`

Search bar in navigation (add to the `(main)` layout). Results page at `/search?q=...` with filter sidebar (category, author, date range).

---

## Phase 8: Semantic Search

> **Goal:** Vector embeddings stored and searched via pgvector. Hybrid search blends full-text and semantic results.

---

### Task 8.1: Embedding service

**Files:**
- Create: `apps/api/src/services/embeddings.ts`
- Create: `apps/api/src/__tests__/services/embeddings.test.ts`

**Interface and factory:**

```typescript
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER ?? 'openai';
  if (provider === 'openai') return new OpenAIEmbeddingProvider();
  if (provider === 'ollama') return new OllamaEmbeddingProvider();
  throw new Error(`Unknown embedding provider: ${provider}`);
}
```

**OpenAI implementation:**

```typescript
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey = process.env.OPENAI_API_KEY!;
  private model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
  private baseUrl = process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com/v1';

  async embed(text: string): Promise<number[]> {
    const results = await this.embedMany([text]);
    return results[0];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const json = await res.json();
    return json.data.map((d: { embedding: number[] }) => d.embedding);
  }
}
```

**Ollama implementation:**

```typescript
class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
  private baseUrl = process.env.EMBEDDING_BASE_URL ?? 'http://localhost:11434';

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const json = await res.json();
    return json.embeddings[0];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch embedding natively — call one at a time
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
```

---

### Task 8.2: Embedding pipeline

**Files:**
- Create: `apps/api/src/services/embedding-pipeline.ts`

**Text extraction:** Use `extractText()` from `apps/api/src/utils/tiptap.ts` (created in Phase 7).

**Chunking algorithm:** Simple character-based chunker (~2000 chars per chunk, 200 char overlap):

```typescript
export function chunkText(text: string, maxChars = 2000, overlap = 200): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }
  return chunks;
}
```

**Pipeline function:**

```typescript
import { eq } from 'drizzle-orm';
import { db, articleEmbeddings, articles } from '@dovetail/db';
import { createEmbeddingProvider } from './embeddings.js';
import { extractText } from '../utils/tiptap.js';
import { chunkText } from './embedding-pipeline.js';

export async function generateEmbeddings(articleId: string): Promise<void> {
  const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
  if (!article) return;

  const text = extractText(article.content);
  if (!text.trim()) return;

  const chunks = chunkText(text);
  const provider = createEmbeddingProvider();
  const embeddings = await provider.embedMany(chunks);

  // Delete old embeddings and insert new ones in a transaction
  await db.transaction(async (tx) => {
    await tx.delete(articleEmbeddings).where(eq(articleEmbeddings.articleId, articleId));
    await tx.insert(articleEmbeddings).values(
      chunks.map((chunk, i) => ({
        articleId,
        chunkIndex: i,
        chunkText: chunk,
        embedding: embeddings[i],
      })),
    );
  });
}
```

**Async invocation (fire-and-forget):**

In article PATCH/POST handlers, after the response:

```typescript
// Don't block the HTTP response — run in background with error logging
void generateEmbeddings(articleId).catch(err =>
  console.error('Embedding generation failed:', err)
);
```

---

### Task 8.3: Hybrid search

**Files:**
- Edit: `apps/api/src/routes/search.ts` (add `mode` parameter)

Add `mode=semantic|fulltext|hybrid` query param to `GET /api/search`.

**pgvector query pattern:**

```sql
SELECT ae.article_id, ae.chunk_text,
       1 - (ae.embedding <=> $1::vector) AS similarity
FROM article_embeddings ae
JOIN articles a ON a.id = ae.article_id
WHERE a.status = 'published'
ORDER BY ae.embedding <=> $1::vector
LIMIT $2
```

**Hybrid merge with Reciprocal Rank Fusion (RRF):**

```typescript
function reciprocalRankFusion(
  fulltextResults: { id: string }[],
  semanticResults: { id: string }[],
  k = 60,
): string[] {
  const scores = new Map<string, number>();

  fulltextResults.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + rank + 1));
  });
  semanticResults.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + rank + 1));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
```

In hybrid mode: run full-text and semantic searches in parallel, merge with RRF, return re-ranked results.

---

## Phase 9: RAG API

> **Goal:** Dedicated endpoint for LLM applications. API-key authenticated. Returns chunks formatted for LLM consumption.

---

### Task 9.1: API keys table, schema, and management endpoints

**Files:**
- Edit: `packages/db/src/schema.ts` (add `apiKeys` table)
- Create: migration file
- Create: `apps/api/src/middleware/apiKeyAuth.ts`
- Create: `apps/api/src/routes/admin/api-keys.ts`
- Create: `apps/api/src/__tests__/routes/admin/api-keys.test.ts`
- Edit: `apps/api/src/app.ts` (mount admin routes)

**Step 1: Add `apiKeys` table to Drizzle schema**

```typescript
// In packages/db/src/schema.ts
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
});
```

**Step 2: Generate and apply migration**

```bash
cd packages/db && pnpm db:generate && DATABASE_URL=... pnpm db:migrate
```

**Step 3: Key generation and hashing**

Use SHA-256 for hashing (API keys are high-entropy random strings, bcrypt is unnecessary):

```typescript
import { createHash, randomBytes } from 'node:crypto';

function generateApiKey(): string {
  return randomBytes(32).toString('base64url');
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

**Step 4: Create API key auth middleware**

> **Critical:** The existing auth middleware treats ALL `Authorization: Bearer <token>` values as JWE tokens and tries to decrypt them. A raw API key will fail decryption, returning 401. The RAG endpoint needs a **separate** auth middleware.

```typescript
// apps/api/src/middleware/apiKeyAuth.ts
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq, isNull } from 'drizzle-orm';
import { db, apiKeys } from '@dovetail/db';

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing API key' });
    return;
  }

  const rawKey = authHeader.slice(7);
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!key || key.revokedAt) {
    res.status(401).json({ error: 'Invalid or revoked API key' });
    return;
  }

  // Update last_used_at (fire-and-forget)
  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

  next();
}
```

**Step 5: Admin CRUD endpoints for key management**

```
POST   /api/admin/api-keys      → create (returns raw key once), admin only
GET    /api/admin/api-keys      → list (shows name, created, last used, status), admin only
DELETE /api/admin/api-keys/:id  → revoke (sets revokedAt), admin only
```

Mount: `app.use('/api/admin/api-keys', apiKeysRouter)`

---

### Task 9.2: RAG search endpoint

**Files:**
- Create: `apps/api/src/routes/rag.ts`
- Create: `apps/api/src/__tests__/routes/rag.test.ts`
- Edit: `apps/api/src/app.ts` (mount router)

```
POST /api/v1/rag/search
Authorization: Bearer <api-key>

{ "query": "...", "limit": 5, "categoryIds": ["..."] }
```

**Uses `apiKeyAuth` middleware** (NOT `authMiddleware`):

```typescript
import { Router } from 'express';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';

export const ragRouter = Router();
ragRouter.post('/search', apiKeyAuth, async (req, res) => {
  // 1. Validate input
  // 2. Embed the query
  // 3. Search article_embeddings via pgvector cosine similarity
  // 4. Format results for LLM consumption
});
```

Mount: `app.use('/api/v1/rag', ragRouter)`

Response:

```json
{
  "results": [
    {
      "articleId": "...",
      "articleTitle": "Notice Requirements",
      "articleUrl": "/articles/notice-requirements",
      "chunkText": "...",
      "score": 0.94
    }
  ]
}
```

---

### Task 9.3: LibreChat integration

Document in `docs/integrations/librechat.md`:
1. Deploy Dovetail
2. Create a RAG API key in admin UI
3. Configure LibreChat RAG endpoint to `https://your-dovetail/api/v1/rag/search`

---

## Phase 10: Polish & Production

> **Goal:** Tags, admin UI, admin API endpoints, production Docker images, end-to-end smoke test.

---

### Task 10.1: Tags

**Files:**
- Create: `apps/api/src/routes/tags.ts`
- Create: `apps/api/src/__tests__/routes/tags.test.ts`
- Edit: `apps/api/src/app.ts` (mount router)

**Endpoints:**

```
GET    /api/tags                      → list all tags, viewer+
POST   /api/tags                      → create tag, editor+
DELETE /api/tags/:id                  → delete tag, admin only
POST   /api/articles/:id/tags        → assign tags to article (body: { tagIds: string[] }), editor+
DELETE /api/articles/:id/tags/:tagId → remove tag from article, editor+
```

Add tag filtering to `GET /api/search` — accept `tags` query param (comma-separated tag IDs or slugs), join through `article_tags`.

Write failing tests. Implement. Mount at `app.use('/api/tags', tagsRouter)`. Run. Commit.

---

### Task 10.2: Admin API endpoints and UI

**Files:**
- Create: `apps/api/src/routes/admin/users.ts`
- Create: `apps/api/src/__tests__/routes/admin/users.test.ts`
- Create: `apps/web/app/(main)/admin/page.tsx`
- Create: `apps/web/app/(main)/admin/users/page.tsx`
- Create: `apps/web/app/(main)/admin/api-keys/page.tsx`
- Edit: `apps/api/src/app.ts` (mount admin routes)

**Admin API endpoints:**

```
GET    /api/admin/users                              → list users (paginated), admin only
PATCH  /api/admin/users/:id                          → update global role, admin only
POST   /api/admin/users/:id/category-roles           → assign category role, admin only
DELETE /api/admin/users/:id/category-roles/:categoryId → remove category role, admin only
```

Mount: `app.use('/api/admin/users', adminUsersRouter)`

**Admin UI pages:**
- `/admin` — dashboard with links to user management and API key management
- `/admin/users` — list users, change roles, assign category roles
- `/admin/api-keys` — create/list/revoke API keys

All admin pages check role via `useSession()` and redirect non-admins.

---

### Task 10.3: Production Dockerfiles

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Edit: `docker-compose.yml`

**`apps/api/Dockerfile`** — multi-stage build with runtime dependencies:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @dovetail/types build
RUN pnpm --filter @dovetail/db build
RUN pnpm --filter @dovetail/api build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json .
COPY --from=builder /app/pnpm-lock.yaml .
COPY --from=builder /app/pnpm-workspace.yaml .
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations
RUN corepack enable && pnpm install --prod --frozen-lockfile
ENV NODE_ENV=production
# Run migrations then start the app
CMD ["sh", "-c", "cd packages/db && node -e \"require('./dist/migrate.js')\" && cd /app && node dist/index.js"]
```

**Note:** Create `packages/db/src/migrate.ts` — a standalone script that runs Drizzle migrations:

```typescript
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './connection.js';
await migrate(db, { migrationsFolder: './migrations' });
```

**`apps/web/Dockerfile`** — Next.js standalone output:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @dovetail/types build
RUN pnpm --filter @dovetail/db build
RUN pnpm --filter @dovetail/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
CMD ["node", "apps/web/server.js"]
```

**Prerequisite:** Enable standalone output in `apps/web/next.config.ts`:

```typescript
const nextConfig = { output: 'standalone' };
```

**Update `docker-compose.yml`** — add required env vars:

```yaml
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-dovetail}:${POSTGRES_PASSWORD:-dovetail}@postgres:5432/${POSTGRES_DB:-dovetail}
      PORT: 3001
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      OAUTH_PROVIDER: ${OAUTH_PROVIDER:-google}
      EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER:-openai}
      EMBEDDING_MODEL: ${EMBEDDING_MODEL:-text-embedding-3-small}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      EMBEDDING_BASE_URL: ${EMBEDDING_BASE_URL:-}
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      API_URL: http://api:3001
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:3001}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}
      OAUTH_PROVIDER: ${OAUTH_PROVIDER:-google}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      ENTRA_CLIENT_ID: ${ENTRA_CLIENT_ID:-}
      ENTRA_CLIENT_SECRET: ${ENTRA_CLIENT_SECRET:-}
      ENTRA_TENANT_ID: ${ENTRA_TENANT_ID:-}
    ports:
      - "3000:3000"
    depends_on:
      - api
```

---

### Task 10.4: Final smoke test

```bash
docker compose up --build
```

Manual checklist:
- [ ] Login redirects to OAuth provider
- [ ] After login, home page loads
- [ ] Create a category (as admin)
- [ ] Create and publish an article (as editor)
- [ ] Search returns the article
- [ ] RAG endpoint returns chunks for a query
- [ ] Viewer cannot access edit UI
