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

## Phase 4: RBAC

> **Goal:** Role-based access control enforced in Express. Category-level overrides (with cascade to subcategories) resolve correctly.

---

### Task 4.1: Permission resolution service

> **Why:** The cascade logic — "walk up ancestor chain, take most specific role, fall back to global" — is complex enough to deserve its own tested service, separate from HTTP concerns.

**Files:**
- Create: `apps/api/src/services/permissions.ts`
- Create: `apps/api/src/__tests__/services/permissions.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { resolveRole } from '../../services/permissions.js';

// Mock the db module
vi.mock('@dovetail/db', () => ({
  db: { execute: vi.fn() },
}));

describe('resolveRole', () => {
  it('returns global role when no category override exists', async () => {
    // set up mock to return no category rows
    // assert resolveRole returns user's global role
  });

  it('returns category role when exact match exists', async () => {
    // set up mock to return a category role row
    // assert resolveRole returns that role
  });

  it('cascades from parent category', async () => {
    // set up mock: no exact match, but parent has a role
    // assert resolveRole returns parent's role
  });
});
```

**Step 2: Implement `apps/api/src/services/permissions.ts`**

```typescript
import { db } from '@dovetail/db';
import { sql } from 'drizzle-orm';
import type { Role } from '@dovetail/types';

export async function resolveRole(
  userId: string,
  categoryId: string,
  userGlobalRole: Role,
): Promise<Role> {
  // Recursive CTE: walks up the ancestor chain for the given category,
  // then joins to user_category_roles to find the most specific override.
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

  return (result[0]?.role as Role) ?? userGlobalRole;
}
```

**Step 3: Implement tests fully and run**

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

**Files:**
- Create: `apps/api/src/middleware/requireRole.ts`
- Create: `apps/api/src/__tests__/middleware/requireRole.test.ts`

**Step 1: Write failing test**

Test that a `viewer` hitting an `editor`-required route gets 403. Test that an `editor` gets through.

**Step 2: Implement `requireRole.ts`**

```typescript
import type { NextFunction, Response } from 'express';
import type { Role } from '@dovetail/types';
import type { AuthRequest } from './auth.js';

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export function requireRole(minimum: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req.user?.role ?? 'viewer') as Role;
    if (RANK[userRole] < RANK[minimum]) {
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
git add apps/api/src/middleware/requireRole.ts apps/api/src/__tests__/
git commit -m "feat: add requireRole middleware"
```

---

## Phase 5: Core API — Articles & Categories

> **Goal:** Full CRUD for categories and articles. Every save creates a version row. Routes are protected by auth + role middleware.

---

### Task 5.1: Category routes

**Files:**
- Create: `apps/api/src/routes/categories.ts`
- Create: `apps/api/src/__tests__/routes/categories.test.ts`

**Endpoints:**

```
GET    /api/categories          → list all (tree structure), viewer+
POST   /api/categories          → create, editor+
PATCH  /api/categories/:id      → update, editor+
DELETE /api/categories/:id      → delete, admin only
```

Write failing tests first. Implement routes. Run tests. Commit.

---

### Task 5.2: Article routes

**Files:**
- Create: `apps/api/src/routes/articles.ts`
- Create: `apps/api/src/__tests__/routes/articles.test.ts`

**Endpoints:**

```
GET    /api/articles               → list (filter by status, category), viewer+
GET    /api/articles/:id           → get one, viewer+
POST   /api/articles               → create draft, editor+
PATCH  /api/articles/:id           → update (creates version), editor of category+
DELETE /api/articles/:id           → archive (soft delete), editor+
POST   /api/articles/:id/publish   → publish, editor+
```

**Important:** Every `PATCH` must:
1. Fetch the current article
2. Insert a row into `article_versions` with the current content
3. Increment `version_number`
4. Apply the update to `articles`

Write failing tests. Implement. Run. Commit.

---

### Task 5.3: Version history routes

**Endpoints:**

```
GET  /api/articles/:id/versions              → list versions
GET  /api/articles/:id/versions/:versionId   → get snapshot
POST /api/articles/:id/versions/:versionId/restore → restore (creates new version)
```

Write failing tests. Implement. Run. Commit.

---

## Phase 6: Frontend

> **Goal:** Next.js pages for browsing, reading, and editing articles. Role-aware UI (editors see edit buttons; viewers don't).

---

### Task 6.1: Category tree sidebar

**File:** `apps/web/components/Sidebar.tsx`

Fetches `/api/categories`, renders a collapsible tree using recursive components. Links navigate to `/categories/[slug]`.

### Task 6.2: Article list page

**File:** `apps/web/app/categories/[slug]/page.tsx`

Server component. Fetches articles in that category from the API. Lists titles, author, updated date, status badge.

### Task 6.3: Article view page

**File:** `apps/web/app/articles/[slug]/page.tsx`

Renders article content (Tiptap JSON → HTML). Shows metadata. Editor+ sees "Edit" button.

### Task 6.4: Article editor

**File:** `apps/web/app/articles/[slug]/edit/page.tsx`

Install Tiptap:

```bash
cd apps/web && pnpm add @tiptap/react @tiptap/starter-kit
```

Rich text editor component. Save button calls `PATCH /api/articles/:id`. Publish button calls `POST /api/articles/:id/publish`.

### Task 6.5: Version history page

**File:** `apps/web/app/articles/[slug]/history/page.tsx`

Lists versions. Links to version snapshot view. Admin/editor can restore.

---

## Phase 7: Full-Text Search

> **Goal:** `GET /api/search?q=...` returns ranked articles. Postgres does the heavy lifting.

---

### Task 7.1: Add tsvector column and trigger via migration

> **Why:** A `tsvector` is a preprocessed, indexed version of text that Postgres can search extremely fast. The trigger keeps it in sync automatically — you never have to remember to update it.

**Step 1: Create a new Drizzle migration**

Add raw SQL to a new migration file (Drizzle allows custom SQL migrations):

```sql
-- Add search_vector column with proper type
ALTER TABLE articles ADD COLUMN search_vector_ts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content::text, ''))
  ) STORED;

CREATE INDEX articles_search_idx ON articles USING GIN(search_vector_ts);
```

**Step 2: Apply migration**

```bash
cd packages/db && DATABASE_URL=... pnpm db:migrate
```

### Task 7.2: Search endpoint

**File:** `apps/api/src/routes/search.ts`

```
GET /api/search?q=...&categoryId=...&authorId=...&from=...&to=...&tags=...
```

Uses `to_tsquery` + `ts_rank` for relevance-ranked results. All filters are additive WHERE clauses.

Write failing test. Implement. Run. Commit.

### Task 7.3: Search UI

Search bar in navigation. Results page at `/search?q=...` with filter sidebar.

---

## Phase 8: Semantic Search

> **Goal:** Vector embeddings stored and searched via pgvector. Hybrid search blends full-text and semantic results.

---

### Task 8.1: Embedding service

**File:** `apps/api/src/services/embeddings.ts`

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

function createEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER ?? 'openai';
  if (provider === 'openai') return new OpenAIEmbeddingProvider();
  if (provider === 'ollama') return new OllamaEmbeddingProvider();
  throw new Error(`Unknown embedding provider: ${provider}`);
}
```

### Task 8.2: Embedding pipeline

On article save/update:
1. Extract plain text from article content JSON
2. Split into ~512-token overlapping chunks
3. Embed each chunk
4. Delete old `article_embeddings` rows for this article
5. Insert new rows

Run as async background work (don't block the HTTP response).

### Task 8.3: Semantic search

Add `mode=semantic|fulltext|hybrid` param to `GET /api/search`. In hybrid mode, fetch top-K from both, merge, re-rank by combined score.

---

## Phase 9: RAG API

> **Goal:** Dedicated endpoint for LLM applications. API-key authenticated. Returns chunks formatted for LLM consumption.

---

### Task 9.1: API keys table and management

**Migration:** Add `api_keys` table (id, name, key_hash, created_by, created_at, last_used_at, revoked_at).

**Admin UI:** Create/list/revoke API keys. Keys are shown once on creation (store only the hash).

### Task 9.2: RAG search endpoint

```
POST /api/v1/rag/search
Authorization: Bearer <api-key>

{ "query": "...", "limit": 5, "categoryIds": ["..."] }
```

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

### Task 9.3: LibreChat integration

Document in `docs/integrations/librechat.md`:
1. Deploy Dovetail
2. Create a RAG API key in admin UI
3. Configure LibreChat RAG endpoint to `https://your-dovetail/api/v1/rag/search`

---

## Phase 10: Polish & Production

> **Goal:** Tags, admin UI, production Docker images, end-to-end smoke test.

---

### Task 10.1: Tags

CRUD endpoints for tags. Tag assignment on articles. Filter by tag in search.

### Task 10.2: Admin UI

User management page (list users, change global role). Category role assignment UI.

### Task 10.3: Production Dockerfiles

**`apps/api/Dockerfile`** — multi-stage build:

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
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

**`apps/web/Dockerfile`** — similar multi-stage build using `next build` and `next start`.

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
