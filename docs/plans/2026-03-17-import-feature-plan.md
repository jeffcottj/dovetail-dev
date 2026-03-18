# Import Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reusable admin feature to import Flowlu Knowledge Base exports (ZIP upload) into Dovetail, with preview, background processing, progress tracking, and bulk publish.

**Architecture:** ZIP uploaded via admin UI → API extracts and parses → preview returned → background job creates categories, articles, and attachments → SSE streams progress → bulk publish endpoint for post-import review.

**Tech Stack:** Express 5, Drizzle ORM, Zod, `multer` (file upload), `adm-zip` (ZIP extraction), `@tiptap/pm` + `prosemirror-model` (HTML→TipTap JSON), SSE (native Node.js), React 19 + Next.js 15 (admin UI).

---

## Phase 1: Foundation

### Task 1: Add `attachments` and `import_jobs` tables to schema

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts` (exports are automatic via `export * from './schema.js'`)

**Step 1: Add the new table definitions to the schema**

Add after the `articleEmbeddings` table in `packages/db/src/schema.ts`:

```typescript
export const importStatusEnum = pgEnum('import_status', ['pending', 'running', 'completed', 'failed']);

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  storagePath: text('storage_path').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: importStatusEnum('status').notNull().default('pending'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  totalArticles: integer('total_articles').notNull().default(0),
  importedCount: integer('imported_count').notNull().default(0),
  errorLog: jsonb('error_log').notNull().default([]),
  options: jsonb('options').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});
```

Add relations for attachments (after existing relations block):

```typescript
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  article: one(articles, { fields: [attachments.articleId], references: [articles.id] }),
}));

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  createdByUser: one(users, { fields: [importJobs.createdBy], references: [users.id] }),
}));
```

**Step 2: Generate the migration**

Run: `cd packages/db && pnpm db:generate`
Expected: A new SQL migration file in `packages/db/migrations/`

**Step 3: Apply the migration**

Run: `cd packages/db && pnpm db:migrate`
Expected: Tables created in local Postgres

**Step 4: Rebuild the DB package**

Run: `pnpm --filter @dovetail/db build`
Expected: Clean build, new tables exported

**Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add attachments and import_jobs tables"
```

---

### Task 2: Install new API dependencies

**Files:**
- Modify: `apps/api/package.json`

**Step 1: Install multer, adm-zip, and mime-types**

Run: `pnpm --filter @dovetail/api add multer adm-zip mime-types && pnpm --filter @dovetail/api add -D @types/multer @types/adm-zip @types/mime-types`

These provide:
- `multer` — multipart/form-data file upload middleware for Express
- `adm-zip` — ZIP extraction (pure JS, no native deps)
- `mime-types` — MIME type lookup from file extension

**Step 2: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore: add multer, adm-zip, mime-types deps to API"
```

---

### Task 3: Create file storage utility

**Files:**
- Create: `apps/api/src/utils/storage.ts`
- Create: `apps/api/src/__tests__/utils/storage.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/utils/storage.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getUploadsDir, ensureDir, copyFile, cleanupDir } from '../../utils/storage.js';

describe('storage utils', () => {
  let tempBase: string;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'dovetail-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  describe('ensureDir', () => {
    it('creates nested directories', async () => {
      const dir = path.join(tempBase, 'a', 'b', 'c');
      await ensureDir(dir);
      expect(fs.existsSync(dir)).toBe(true);
    });

    it('is idempotent', async () => {
      const dir = path.join(tempBase, 'exists');
      await ensureDir(dir);
      await ensureDir(dir); // no throw
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('copyFile', () => {
    it('copies a file to the target path', async () => {
      const src = path.join(tempBase, 'source.txt');
      const dest = path.join(tempBase, 'out', 'dest.txt');
      fs.writeFileSync(src, 'hello');
      await copyFile(src, dest);
      expect(fs.readFileSync(dest, 'utf-8')).toBe('hello');
    });
  });

  describe('cleanupDir', () => {
    it('removes a directory and its contents', async () => {
      const dir = path.join(tempBase, 'cleanup-me');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'file.txt'), 'data');
      await cleanupDir(dir);
      expect(fs.existsSync(dir)).toBe(false);
    });

    it('does not throw if directory does not exist', async () => {
      await cleanupDir(path.join(tempBase, 'nope'));
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/utils/storage.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// apps/api/src/utils/storage.ts
import fs from 'node:fs/promises';
import path from 'node:path';

/** Root uploads directory. Override via UPLOADS_DIR env var. */
export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), 'uploads');
}

/** Ensure a directory exists, creating parent dirs as needed. */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Copy a file, creating the destination directory if needed. */
export async function copyFile(src: string, dest: string): Promise<void> {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

/** Remove a directory recursively. No-op if it doesn't exist. */
export async function cleanupDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/__tests__/utils/storage.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/api/src/utils/storage.ts apps/api/src/__tests__/utils/storage.test.ts
git commit -m "feat: add file storage utility"
```

---

### Task 4: Build the Flowlu parser — data.json + category tree

**Files:**
- Create: `apps/api/src/services/import/flowlu-parser.ts`
- Create: `apps/api/src/__tests__/services/flowlu-parser.test.ts`

This module reads `data.json` and builds the category tree from the `code` field hierarchy. It does NOT read HTML files — that's Task 5.

**Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/services/flowlu-parser.test.ts
import { describe, expect, it } from 'vitest';
import { parseDataJson, buildCategoryTree, type FlowluArticle, type CategoryNode } from '../../services/import/flowlu-parser.js';

const sampleData = {
  articles: {
    '11': { title: 'Consumer Debt Collection', code: '11--consumer-debt-collection', index: 'overview...', tags: [] },
    '12': { title: 'Defending Claims', code: '11-12--defending-claims', index: 'basic defenses...', tags: ['Tag A'] },
    '15': { title: 'HOA MD Contract Lien Act', code: '11-14-15--hoa-md-contract-lien-act', index: 'resources...', tags: [] },
    '14': { title: 'HOA Collections', code: '11-14--hoa-collections', index: 'hoa overview...', tags: [] },
    '37': { title: 'Family Law', code: '37--family-law', index: 'family...', tags: [] },
  },
};

describe('parseDataJson', () => {
  it('parses articles from data.json content', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    expect(articles).toHaveLength(5);
    expect(articles[0]).toMatchObject({
      id: '11',
      title: 'Consumer Debt Collection',
      code: '11--consumer-debt-collection',
      slug: 'consumer-debt-collection',
    });
  });

  it('extracts the slug from the code field (everything after --)', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const art12 = articles.find(a => a.id === '12');
    expect(art12!.slug).toBe('defending-claims');
  });

  it('derives parentChain from the numeric prefix', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const art15 = articles.find(a => a.id === '15');
    expect(art15!.parentChain).toEqual(['11', '14']);
  });

  it('top-level articles have empty parentChain', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const art11 = articles.find(a => a.id === '11');
    expect(art11!.parentChain).toEqual([]);
  });
});

describe('buildCategoryTree', () => {
  it('builds a tree from parsed articles', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const tree = buildCategoryTree(articles);

    // Two top-level categories: Consumer Debt Collection (11) and Family Law (37)
    expect(tree).toHaveLength(2);

    const cdc = tree.find(n => n.sourceId === '11')!;
    expect(cdc.name).toBe('Consumer Debt Collection');
    expect(cdc.children).toHaveLength(2); // 12 (Defending Claims) and 14 (HOA Collections)

    const hoa = cdc.children.find(n => n.sourceId === '14')!;
    expect(hoa.children).toHaveLength(1); // 15
    expect(hoa.children[0].sourceId).toBe('15');
  });

  it('counts articles per category node', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const tree = buildCategoryTree(articles);
    const cdc = tree.find(n => n.sourceId === '11')!;
    // Articles directly in CDC: 11 itself, plus 12
    // 14 is a subcategory with its own article, and 15 is under 14
    expect(cdc.articleCount).toBe(2); // 11 and 12 are directly in this category
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/flowlu-parser.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// apps/api/src/services/import/flowlu-parser.ts

export interface FlowluArticle {
  id: string;
  title: string;
  code: string;
  slug: string;
  index: string;
  tags: string[];
  parentChain: string[]; // ancestor IDs, e.g. ['11', '14'] for code '11-14-15--slug'
}

export interface CategoryNode {
  sourceId: string;
  name: string;
  slug: string;
  children: CategoryNode[];
  articleCount: number; // direct articles only (not recursive)
}

interface RawDataJson {
  articles: Record<string, { title: string; code: string; index: string; tags: string[] }>;
}

/**
 * Parse the data.json content from a Flowlu KB export.
 * Returns a flat list of articles with hierarchy info derived from the code field.
 */
export function parseDataJson(jsonContent: string): FlowluArticle[] {
  const data: RawDataJson = JSON.parse(jsonContent);
  const articles: FlowluArticle[] = [];

  for (const [id, raw] of Object.entries(data.articles)) {
    const [prefix, ...slugParts] = raw.code.split('--');
    const slug = slugParts.join('--'); // rejoin in case slug contains --
    const numericParts = prefix.split('-');
    // Last part is the article's own ID, preceding parts are ancestor IDs
    const parentChain = numericParts.slice(0, -1);

    articles.push({
      id,
      title: raw.title,
      code: raw.code,
      slug,
      index: raw.index,
      tags: raw.tags,
      parentChain,
    });
  }

  return articles;
}

/**
 * Build a category tree from parsed articles.
 *
 * An article whose ID appears as a parent in another article's parentChain
 * becomes a category node. Articles that are categories also have their own
 * content (they are both a category and an article).
 *
 * The tree structure:
 * - Top-level: articles with empty parentChain
 * - Children: articles whose parentChain's last element is this node's sourceId
 */
export function buildCategoryTree(articles: FlowluArticle[]): CategoryNode[] {
  // Index articles by ID for fast lookup
  const byId = new Map<string, FlowluArticle>();
  for (const art of articles) {
    byId.set(art.id, art);
  }

  // Determine which IDs are used as parents (and thus are categories)
  const parentIds = new Set<string>();
  for (const art of articles) {
    for (const pid of art.parentChain) {
      parentIds.add(pid);
    }
  }

  // Build nodes for each category
  const nodes = new Map<string, CategoryNode>();
  for (const id of parentIds) {
    const art = byId.get(id);
    nodes.set(id, {
      sourceId: id,
      name: art?.title ?? `Category ${id}`,
      slug: art?.slug ?? id,
      children: [],
      articleCount: 0,
    });
  }

  // Also create nodes for top-level articles that are categories
  // (already covered above, but ensure all top-levels with children exist)

  // Count articles per category and build parent-child links
  for (const art of articles) {
    if (art.parentChain.length === 0) {
      // Top-level: if this article is a category, count itself
      if (nodes.has(art.id)) {
        nodes.get(art.id)!.articleCount += 1;
      }
    } else {
      // Immediate parent is the last element of parentChain
      const immediateParent = art.parentChain[art.parentChain.length - 1];

      if (parentIds.has(art.id)) {
        // This article is also a category — add it as a child node
        const parentNode = nodes.get(immediateParent);
        const childNode = nodes.get(art.id)!;
        childNode.articleCount += 1; // count itself
        parentNode?.children.push(childNode);
      } else {
        // Leaf article — just count it
        const parentNode = nodes.get(immediateParent);
        if (parentNode) {
          parentNode.articleCount += 1;
        }
      }
    }
  }

  // Return top-level nodes (categories with no parent)
  const topLevel: CategoryNode[] = [];
  for (const art of articles) {
    if (art.parentChain.length === 0 && nodes.has(art.id)) {
      topLevel.push(nodes.get(art.id)!);
    }
  }

  // Also include top-level leaf articles (not categories) — they need a category
  // We handle this at import time, not in tree building

  return topLevel;
}
```

**Step 4: Run tests and iterate until passing**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/flowlu-parser.test.ts`
Expected: All PASS. Adjust articleCount logic if needed — the test expects `cdc.articleCount` to be 2 (article 11 itself + article 12 which is directly under 11, not under 14).

**Step 5: Commit**

```bash
git add apps/api/src/services/import/ apps/api/src/__tests__/services/flowlu-parser.test.ts
git commit -m "feat: add Flowlu data.json parser and category tree builder"
```

---

### Task 5: Build HTML body extractor

**Files:**
- Create: `apps/api/src/services/import/html-extractor.ts`
- Create: `apps/api/src/__tests__/services/html-extractor.test.ts`

Extracts the `<div itemprop="articleBody">` content and `<meta itemprop="dateModified">` from Flowlu HTML pages.

**Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/services/html-extractor.test.ts
import { describe, expect, it } from 'vitest';
import { extractArticleBody, extractDateModified } from '../../services/import/html-extractor.js';

const sampleHtml = `
<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
<article class="kb-article" itemscope itemtype="https://schema.org/Article">
    <meta itemprop="dateModified" content="2024-10-02T17:14:26+03:00">
    <h1 itemprop="headline">Test Article</h1>
    <hr>
    <div itemprop="articleBody">
        <p>First paragraph with <strong>bold</strong> text.</p>
        <h2>Section heading</h2>
        <ul><li>Item one</li><li>Item two</li></ul>
        <a href="https://example.com">Link</a>
    </div>
</article>
</body>
</html>`;

describe('extractArticleBody', () => {
  it('extracts the articleBody div content', () => {
    const body = extractArticleBody(sampleHtml);
    expect(body).toContain('<p>First paragraph');
    expect(body).toContain('<strong>bold</strong>');
    expect(body).toContain('<h2>Section heading</h2>');
    expect(body).not.toContain('itemprop="headline"');
  });

  it('returns empty string for HTML without articleBody', () => {
    const body = extractArticleBody('<html><body><p>No article</p></body></html>');
    expect(body).toBe('');
  });
});

describe('extractDateModified', () => {
  it('extracts the dateModified ISO string', () => {
    const date = extractDateModified(sampleHtml);
    expect(date).toBe('2024-10-02T17:14:26+03:00');
  });

  it('returns null when not present', () => {
    const date = extractDateModified('<html><body></body></html>');
    expect(date).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/html-extractor.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// apps/api/src/services/import/html-extractor.ts

/**
 * Extract the inner HTML of <div itemprop="articleBody"> from a Flowlu KB HTML page.
 * Uses regex rather than a full DOM parser to keep dependencies minimal.
 */
export function extractArticleBody(html: string): string {
  const match = html.match(/<div\s+itemprop="articleBody">([\s\S]*?)<\/div>\s*(?:<br>|<\/article>|\s*<div)/);
  if (!match) return '';
  return match[1].trim();
}

/**
 * Extract the dateModified value from the Schema.org meta tag.
 */
export function extractDateModified(html: string): string | null {
  const match = html.match(/<meta\s+itemprop="dateModified"\s+content="([^"]+)"/);
  return match ? match[1] : null;
}
```

**Step 4: Run tests and iterate**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/html-extractor.test.ts`
Expected: All PASS. The regex for articleBody may need adjustment — the closing pattern needs to match the Flowlu HTML structure where the div is followed by `<br>` or closing `</article>` or another `<div`. Test against the actual sample HTML and refine the regex if needed.

**Step 5: Commit**

```bash
git add apps/api/src/services/import/html-extractor.ts apps/api/src/__tests__/services/html-extractor.test.ts
git commit -m "feat: add HTML body and date extractor for Flowlu import"
```

---

### Task 6: Build HTML → TipTap JSON converter

**Files:**
- Modify: `apps/api/package.json` (add prosemirror deps)
- Create: `apps/api/src/services/import/html-to-tiptap.ts`
- Create: `apps/api/src/__tests__/services/html-to-tiptap.test.ts`

**Step 1: Install ProseMirror dependencies**

Run: `pnpm --filter @dovetail/api add prosemirror-model prosemirror-schema-basic prosemirror-schema-list prosemirror-transform && pnpm --filter @dovetail/api add -D @types/prosemirror-model @types/prosemirror-schema-basic @types/prosemirror-schema-list @types/prosemirror-transform`

Also need an HTML parser for Node: `pnpm --filter @dovetail/api add linkedom`

`linkedom` provides a lightweight DOM in Node.js for parsing HTML, which ProseMirror's `DOMParser` needs.

**Step 2: Write the failing tests**

```typescript
// apps/api/src/__tests__/services/html-to-tiptap.test.ts
import { describe, expect, it } from 'vitest';
import { htmlToTiptap } from '../../services/import/html-to-tiptap.js';

describe('htmlToTiptap', () => {
  it('converts a simple paragraph', () => {
    const result = htmlToTiptap('<p>Hello world</p>');
    expect(result.type).toBe('doc');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('paragraph');
    expect(result.content[0].content[0]).toMatchObject({ type: 'text', text: 'Hello world' });
  });

  it('converts bold and italic marks', () => {
    const result = htmlToTiptap('<p><strong>bold</strong> and <em>italic</em></p>');
    const para = result.content[0];
    const boldNode = para.content.find((n: any) => n.text === 'bold');
    expect(boldNode.marks).toContainEqual({ type: 'bold' });
    const italicNode = para.content.find((n: any) => n.text === 'italic');
    expect(italicNode.marks).toContainEqual({ type: 'italic' });
  });

  it('converts headings with correct level', () => {
    const result = htmlToTiptap('<h2>My Heading</h2>');
    expect(result.content[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
    });
  });

  it('converts links', () => {
    const result = htmlToTiptap('<p><a href="https://example.com">click</a></p>');
    const link = result.content[0].content[0];
    expect(link.marks).toContainEqual(
      expect.objectContaining({ type: 'link', attrs: expect.objectContaining({ href: 'https://example.com' }) }),
    );
  });

  it('converts unordered lists', () => {
    const result = htmlToTiptap('<ul><li>one</li><li>two</li></ul>');
    expect(result.content[0].type).toBe('bulletList');
    expect(result.content[0].content).toHaveLength(2);
    expect(result.content[0].content[0].type).toBe('listItem');
  });

  it('converts ordered lists', () => {
    const result = htmlToTiptap('<ol><li>first</li></ol>');
    expect(result.content[0].type).toBe('orderedList');
  });

  it('converts tables', () => {
    const result = htmlToTiptap('<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>');
    expect(result.content[0].type).toBe('table');
  });

  it('converts blockquotes', () => {
    const result = htmlToTiptap('<blockquote><p>Quoted text</p></blockquote>');
    expect(result.content[0].type).toBe('blockquote');
  });

  it('converts horizontal rules', () => {
    const result = htmlToTiptap('<p>Before</p><hr><p>After</p>');
    expect(result.content[1].type).toBe('horizontalRule');
  });

  it('returns an empty doc for empty input', () => {
    const result = htmlToTiptap('');
    expect(result).toEqual({ type: 'doc', content: [] });
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/html-to-tiptap.test.ts`
Expected: FAIL

**Step 4: Write the implementation**

```typescript
// apps/api/src/services/import/html-to-tiptap.ts
import { parseHTML } from 'linkedom';
import { Schema, DOMParser as ProseDOMParser } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

// Build a TipTap-compatible ProseMirror schema
const nodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');

// Add table nodes
const withTables = nodes
  .append({
    table: {
      content: 'tableRow+',
      tableRole: 'table',
      group: 'block',
      parseDOM: [{ tag: 'table' }],
      toDOM() { return ['table', ['tbody', 0]]; },
    },
    tableRow: {
      content: '(tableCell | tableHeader)+',
      tableRole: 'row',
      parseDOM: [{ tag: 'tr' }],
      toDOM() { return ['tr', 0]; },
    },
    tableCell: {
      content: 'inline*',
      tableRole: 'cell',
      parseDOM: [{ tag: 'td' }],
      toDOM() { return ['td', 0]; },
    },
    tableHeader: {
      content: 'inline*',
      tableRole: 'header_cell',
      parseDOM: [{ tag: 'th' }],
      toDOM() { return ['th', 0]; },
    },
  });

// Add link mark
const marks = basicSchema.spec.marks.append({
  link: {
    attrs: { href: { default: null }, target: { default: '_blank' } },
    inclusive: false,
    parseDOM: [{
      tag: 'a[href]',
      getAttrs(dom: any) {
        return { href: dom.getAttribute('href'), target: dom.getAttribute('target') || '_blank' };
      },
    }],
    toDOM(mark: any) { return ['a', { href: mark.attrs.href, target: mark.attrs.target }, 0]; },
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() { return ['u', 0]; },
  },
});

const tiptapSchema = new Schema({ nodes: withTables, marks });

/**
 * Convert an HTML string to TipTap-compatible JSON.
 * Uses ProseMirror's DOMParser with linkedom for server-side DOM.
 */
export function htmlToTiptap(html: string): any {
  if (!html.trim()) {
    return { type: 'doc', content: [] };
  }

  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const body = document.querySelector('body')!;
  const doc = ProseDOMParser.fromSchema(tiptapSchema).parse(body);
  return docToJSON(doc);
}

/** Recursively convert a ProseMirror Node to TipTap JSON. */
function docToJSON(node: any): any {
  const result: any = { type: tiptapTypeName(node.type.name) };

  // Attrs (only include non-default)
  if (node.attrs && Object.keys(node.attrs).length > 0) {
    const attrs: Record<string, any> = {};
    for (const [key, value] of Object.entries(node.attrs)) {
      const defaultVal = node.type.attrs[key]?.default;
      if (value !== defaultVal) {
        attrs[key] = value;
      }
    }
    if (Object.keys(attrs).length > 0) {
      result.attrs = attrs;
    }
  }

  // Marks
  if (node.marks && node.marks.length > 0) {
    result.marks = node.marks.map((mark: any) => {
      const m: any = { type: tiptapTypeName(mark.type.name) };
      if (mark.attrs && Object.keys(mark.attrs).length > 0) {
        const attrs: Record<string, any> = {};
        for (const [key, value] of Object.entries(mark.attrs)) {
          const defaultVal = mark.type.attrs[key]?.default;
          if (value !== defaultVal) {
            attrs[key] = value;
          }
        }
        if (Object.keys(attrs).length > 0) {
          m.attrs = attrs;
        }
      }
      return m;
    });
  }

  // Text content
  if (node.isText) {
    result.text = node.text;
  }

  // Children
  if (node.content && node.content.size > 0) {
    result.content = [];
    node.content.forEach((child: any) => {
      result.content.push(docToJSON(child));
    });
  }

  return result;
}

/** Map ProseMirror node type names to TipTap conventions. */
function tiptapTypeName(name: string): string {
  const map: Record<string, string> = {
    bullet_list: 'bulletList',
    ordered_list: 'orderedList',
    list_item: 'listItem',
    hard_break: 'hardBreak',
    horizontal_rule: 'horizontalRule',
    code_block: 'codeBlock',
    table_row: 'tableRow',
    table_cell: 'tableCell',
    table_header: 'tableHeader',
  };
  return map[name] ?? name;
}
```

**Step 5: Run tests and iterate**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/html-to-tiptap.test.ts`
Expected: All PASS. Some tests may need adjustment based on how ProseMirror parses certain HTML — particularly tables and marks. The key is that the output is valid TipTap JSON that the frontend editor can render.

**Step 6: Commit**

```bash
git add apps/api/src/services/import/html-to-tiptap.ts apps/api/src/__tests__/services/html-to-tiptap.test.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add HTML-to-TipTap JSON converter for import"
```

---

## Phase 2: API Endpoints + Import Engine

### Task 7: Create the import preview endpoint

**Files:**
- Create: `apps/api/src/routes/admin/import.ts`
- Modify: `apps/api/src/app.ts` (mount the router)

**Step 1: Write the failing test**

```typescript
// apps/api/src/__tests__/routes/admin/import.test.ts
import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../../helpers/token.js';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { app } from '../../../app.js';

describe('Import admin routes', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  describe('POST /api/admin/import/preview', () => {
    it('returns 403 for non-admin users', async () => {
      const res = await supertest(app)
        .post('/api/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when no file is uploaded', async () => {
      const res = await supertest(app)
        .post('/api/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(400);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/admin/import.test.ts`
Expected: FAIL

**Step 3: Write the route implementation**

```typescript
// apps/api/src/routes/admin/import.ts
import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { getUploadsDir, ensureDir, cleanupDir } from '../../utils/storage.js';
import { parseDataJson, buildCategoryTree } from '../../services/import/flowlu-parser.js';
import { extractArticleBody } from '../../services/import/html-extractor.js';

const upload = multer({ dest: path.join(getUploadsDir(), 'import-temp') });

// In-memory map of temp import sessions (tempId → dirPath)
const tempSessions = new Map<string, { dir: string; createdAt: number }>();

// Cleanup stale sessions after 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000;

export const importRouter: Router = Router();

// POST /api/admin/import/preview — upload ZIP, return summary
importRouter.post(
  '/preview',
  authMiddleware,
  requireRole('admin'),
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const tempId = randomUUID();
    const extractDir = path.join(getUploadsDir(), 'import-temp', tempId);

    try {
      // Extract ZIP
      const zip = new AdmZip(req.file.path);
      await ensureDir(extractDir);
      zip.extractAllTo(extractDir, true);

      // Clean up the uploaded ZIP file
      await fs.unlink(req.file.path);

      // Parse data.json
      const dataJsonPath = path.join(extractDir, 'assets', 'data.json');
      const dataJsonContent = await fs.readFile(dataJsonPath, 'utf-8');
      const articles = parseDataJson(dataJsonContent);
      const tree = buildCategoryTree(articles);

      // Count attachments
      const imagesDir = path.join(extractDir, 'assets', 'images');
      let attachmentCount = 0;
      try {
        const imageDirs = await fs.readdir(imagesDir);
        for (const dir of imageDirs) {
          const dirPath = path.join(imagesDir, dir);
          const stat = await fs.stat(dirPath);
          if (stat.isDirectory() && /^\d+$/.test(dir)) {
            const files = await fs.readdir(dirPath);
            attachmentCount += files.length;
          }
        }
      } catch { /* no images dir */ }

      // Check for warnings (articles with no HTML file)
      const warnings: { article: string; message: string }[] = [];
      for (const art of articles) {
        const htmlPath = path.join(extractDir, 'articles', art.code, 'index.html');
        try {
          await fs.access(htmlPath);
        } catch {
          warnings.push({ article: art.title, message: 'No HTML file found; article will be imported with empty content' });
        }
      }

      // Store session
      tempSessions.set(tempId, { dir: extractDir, createdAt: Date.now() });

      // Schedule cleanup
      setTimeout(() => {
        const session = tempSessions.get(tempId);
        if (session) {
          tempSessions.delete(tempId);
          void cleanupDir(session.dir);
        }
      }, SESSION_TTL_MS);

      res.json({
        tempId,
        summary: {
          articleCount: articles.length,
          categoryCount: tree.reduce((acc, n) => acc + countNodes(n), 0),
          attachmentCount,
          categoryTree: tree,
        },
        warnings,
      });
    } catch (err: any) {
      await cleanupDir(extractDir);
      res.status(400).json({ error: `Failed to parse export: ${err.message}` });
    }
  },
);

function countNodes(node: { children: any[] }): number {
  return 1 + node.children.reduce((acc: number, child: any) => acc + countNodes(child), 0);
}

export { tempSessions };
```

**Step 4: Mount the router in app.ts**

Add before the `// --- Mount route files above this line ---` comment in `apps/api/src/app.ts`:

```typescript
import { importRouter } from './routes/admin/import.js';
app.use('/api/admin/import', importRouter);
```

**Step 5: Run tests**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/admin/import.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/admin/import.ts apps/api/src/app.ts apps/api/src/__tests__/routes/admin/import.test.ts
git commit -m "feat: add import preview endpoint with ZIP parsing"
```

---

### Task 8: Build the import engine

**Files:**
- Create: `apps/api/src/services/import/import-engine.ts`
- Create: `apps/api/src/__tests__/services/import-engine.test.ts`

The import engine is the core logic: given a parsed export directory, create categories, articles, and attachments in the database. It emits progress events for the SSE stream.

**Step 1: Write the failing tests**

Focus on testing the key logic: category creation with deduplication, article insertion, and attachment copying. Mock the DB layer.

```typescript
// apps/api/src/__tests__/services/import-engine.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { ImportEngine } from '../../services/import/import-engine.js';
import { db } from '@dovetail/db';
import { createChain } from '../helpers/db-mock.js';

describe('ImportEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can be instantiated with options', () => {
    const engine = new ImportEngine({
      extractDir: '/tmp/test',
      userId: 'user-1',
      defaultStatus: 'draft',
      jobId: 'job-1',
    });
    expect(engine).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/import-engine.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// apps/api/src/services/import/import-engine.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db, categories, articles, attachments, importJobs } from '@dovetail/db';
import { toSlug } from '../../utils/slug.js';
import { extractText } from '../../utils/tiptap.js';
import { getUploadsDir, ensureDir, copyFile } from '../../utils/storage.js';
import { parseDataJson, buildCategoryTree, type FlowluArticle } from './flowlu-parser.js';
import { extractArticleBody, extractDateModified } from './html-extractor.js';
import { htmlToTiptap } from './html-to-tiptap.js';
import mime from 'mime-types';

export type ProgressEvent =
  | { type: 'progress'; imported: number; total: number; current: string }
  | { type: 'error'; article: string; message: string }
  | { type: 'complete'; imported: number; errors: number };

export interface ImportEngineOptions {
  extractDir: string;
  userId: string;
  defaultStatus: 'draft' | 'published';
  jobId: string;
}

export class ImportEngine {
  private opts: ImportEngineOptions;
  private listeners: ((event: ProgressEvent) => void)[] = [];
  private importedCount = 0;
  private errorCount = 0;

  constructor(opts: ImportEngineOptions) {
    this.opts = opts;
  }

  onProgress(listener: (event: ProgressEvent) => void) {
    this.listeners.push(listener);
  }

  private emit(event: ProgressEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async run(): Promise<void> {
    // Update job status to running
    await db.update(importJobs)
      .set({ status: 'running' })
      .where(eq(importJobs.id, this.opts.jobId));

    try {
      // 1. Parse data.json
      const dataJsonPath = path.join(this.opts.extractDir, 'assets', 'data.json');
      const dataJsonContent = await fs.readFile(dataJsonPath, 'utf-8');
      const flowluArticles = parseDataJson(dataJsonContent);
      const tree = buildCategoryTree(flowluArticles);

      // Update total count
      await db.update(importJobs)
        .set({ totalArticles: flowluArticles.length })
        .where(eq(importJobs.id, this.opts.jobId));

      // 2. Create categories (depth-first, deduplicating against existing)
      const categoryMap = await this.createCategories(tree);

      // 3. Import articles
      for (const art of flowluArticles) {
        try {
          await this.importArticle(art, categoryMap);
          this.importedCount++;
          this.emit({ type: 'progress', imported: this.importedCount, total: flowluArticles.length, current: art.title });

          // Update job progress
          await db.update(importJobs)
            .set({ importedCount: this.importedCount })
            .where(eq(importJobs.id, this.opts.jobId));
        } catch (err: any) {
          this.errorCount++;
          const message = err.message ?? 'Unknown error';
          this.emit({ type: 'error', article: art.title, message });

          // Log error to job
          await db.update(importJobs)
            .set({
              errorLog: sql`${importJobs.errorLog} || ${JSON.stringify([{ article_title: art.title, error_message: message }])}::jsonb`,
            })
            .where(eq(importJobs.id, this.opts.jobId));
        }
      }

      // 4. Mark complete
      await db.update(importJobs)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(importJobs.id, this.opts.jobId));

      this.emit({ type: 'complete', imported: this.importedCount, errors: this.errorCount });
    } catch (err: any) {
      await db.update(importJobs)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(importJobs.id, this.opts.jobId));
      throw err;
    }
  }

  /**
   * Create categories from the tree, returning a map of sourceId → dovetailCategoryId.
   * Deduplicates: if a category with the same slug and parent already exists, reuse it.
   */
  private async createCategories(
    tree: ReturnType<typeof buildCategoryTree>,
    parentId: string | null = null,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    for (const node of tree) {
      const slug = toSlug(node.name);

      // Check if category already exists at this position
      const existing = await db.select()
        .from(categories)
        .where(
          parentId
            ? and(eq(categories.slug, slug), eq(categories.parentId, parentId))
            : and(eq(categories.slug, slug), sql`${categories.parentId} IS NULL`),
        );

      let categoryId: string;
      if (existing.length > 0) {
        categoryId = existing[0].id;
      } else {
        // Create new category
        try {
          const [created] = await db.insert(categories)
            .values({ name: node.name, slug, parentId })
            .returning();
          categoryId = created.id;
        } catch (err: any) {
          if (err.code === '23505') {
            const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
            const [created] = await db.insert(categories)
              .values({ name: node.name, slug: uniqueSlug, parentId })
              .returning();
            categoryId = created.id;
          } else {
            throw err;
          }
        }
      }

      map.set(node.sourceId, categoryId);

      // Recurse for children
      const childMap = await this.createCategories(node.children, categoryId);
      for (const [k, v] of childMap) {
        map.set(k, v);
      }
    }

    return map;
  }

  /**
   * Import a single article: parse HTML, convert to TipTap, insert, copy attachments.
   */
  private async importArticle(art: FlowluArticle, categoryMap: Map<string, string>): Promise<void> {
    // Determine category: use immediate parent if exists, otherwise find the top-level ancestor
    let categoryId: string | undefined;
    if (art.parentChain.length > 0) {
      const immediateParent = art.parentChain[art.parentChain.length - 1];
      categoryId = categoryMap.get(immediateParent);
    } else if (categoryMap.has(art.id)) {
      // This article IS a top-level category — place it in its own category
      categoryId = categoryMap.get(art.id);
    }

    if (!categoryId) {
      throw new Error(`No category found for article "${art.title}" (code: ${art.code})`);
    }

    // Parse HTML
    let content: any = { type: 'doc', content: [] };
    let dateModified: string | null = null;
    const htmlPath = path.join(this.opts.extractDir, 'articles', art.code, 'index.html');
    try {
      const html = await fs.readFile(htmlPath, 'utf-8');
      const bodyHtml = extractArticleBody(html);
      if (bodyHtml) {
        content = htmlToTiptap(bodyHtml);
      }
      dateModified = extractDateModified(html);
    } catch { /* no HTML file — use empty content */ }

    const plainText = extractText(content);
    const slug = art.slug || toSlug(art.title);

    // Check for duplicate slug
    const existingArticle = await db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug));
    if (existingArticle.length > 0) {
      throw new Error(`Article with slug "${slug}" already exists — skipping`);
    }

    // Insert article
    const now = new Date();
    const publishedAt = this.opts.defaultStatus === 'published' ? now : null;
    const createdAt = dateModified ? new Date(dateModified) : now;

    let articleId: string;
    try {
      const [created] = await db.insert(articles).values({
        title: art.title,
        slug,
        categoryId,
        authorId: this.opts.userId,
        content,
        plainText,
        status: this.opts.defaultStatus,
        createdAt,
        updatedAt: now,
        publishedAt,
      }).returning();
      articleId = created.id;
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name?.includes('slug')) {
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
        const [created] = await db.insert(articles).values({
          title: art.title,
          slug: uniqueSlug,
          categoryId,
          authorId: this.opts.userId,
          content,
          plainText,
          status: this.opts.defaultStatus,
          createdAt,
          updatedAt: now,
          publishedAt,
        }).returning();
        articleId = created.id;
      } else {
        throw err;
      }
    }

    // Copy attachments
    const imagesDir = path.join(this.opts.extractDir, 'assets', 'images', art.id);
    try {
      const files = await fs.readdir(imagesDir);
      for (const file of files) {
        const srcPath = path.join(imagesDir, file);
        const stat = await fs.stat(srcPath);
        if (!stat.isFile()) continue;

        const attachmentId = randomUUID();
        const ext = path.extname(file);
        const storagePath = path.join('uploads', 'attachments', `${attachmentId}${ext}`);
        const destPath = path.join(getUploadsDir(), 'attachments', `${attachmentId}${ext}`);

        await copyFile(srcPath, destPath);

        await db.insert(attachments).values({
          id: attachmentId,
          articleId,
          filename: file,
          storagePath,
          mimeType: mime.lookup(file) || 'application/octet-stream',
          sizeBytes: stat.size,
        });
      }
    } catch { /* no images directory for this article */ }
  }
}
```

**Step 4: Run tests**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/import-engine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/import/import-engine.ts apps/api/src/__tests__/services/import-engine.test.ts
git commit -m "feat: add import engine with category dedup, article insertion, attachments"
```

---

### Task 9: Add execute endpoint with SSE progress

**Files:**
- Modify: `apps/api/src/routes/admin/import.ts`
- Modify: `apps/api/src/__tests__/routes/admin/import.test.ts`

**Step 1: Add tests for the execute and progress endpoints**

Append to the existing import test file:

```typescript
describe('POST /api/admin/import/execute', () => {
  it('returns 403 for non-admin users', async () => {
    const res = await supertest(app)
      .post('/api/admin/import/execute')
      .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
      .send({ tempId: 'fake', options: { defaultStatus: 'draft' } });
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing tempId', async () => {
    const res = await supertest(app)
      .post('/api/admin/import/execute')
      .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
      .send({ options: { defaultStatus: 'draft' } });
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/admin/import.test.ts`

**Step 3: Add the execute, progress, job list, and job detail endpoints**

Add to `apps/api/src/routes/admin/import.ts`:

```typescript
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db, importJobs } from '@dovetail/db';
import { validateBody } from '../../utils/validate.js';
import { ImportEngine, type ProgressEvent } from '../../services/import/import-engine.js';

// In-memory map of active SSE listeners per job
const jobListeners = new Map<string, Set<(event: ProgressEvent) => void>>();

const executeSchema = z.object({
  tempId: z.string().uuid(),
  options: z.object({
    defaultStatus: z.enum(['draft', 'published']).default('draft'),
  }),
});

// POST /api/admin/import/execute — start import job
importRouter.post(
  '/execute',
  authMiddleware,
  requireRole('admin'),
  validateBody(executeSchema),
  async (req: AuthRequest, res) => {
    const { tempId, options } = req.body;

    const session = tempSessions.get(tempId);
    if (!session) {
      res.status(404).json({ error: 'Import session not found or expired' });
      return;
    }

    // Create import job record
    const [job] = await db.insert(importJobs).values({
      createdBy: req.user!.id,
      options,
    }).returning();

    // Start import in background
    const engine = new ImportEngine({
      extractDir: session.dir,
      userId: req.user!.id,
      defaultStatus: options.defaultStatus,
      jobId: job.id,
    });

    // Wire up SSE listeners
    engine.onProgress((event) => {
      const listeners = jobListeners.get(job.id);
      if (listeners) {
        for (const listener of listeners) {
          listener(event);
        }
      }
      // Cleanup on complete
      if (event.type === 'complete') {
        jobListeners.delete(job.id);
        tempSessions.delete(tempId);
        void cleanupDir(session.dir);
      }
    });

    // Fire and forget
    void engine.run().catch(async (err) => {
      console.error('Import engine error:', err);
      const listeners = jobListeners.get(job.id);
      if (listeners) {
        for (const listener of listeners) {
          listener({ type: 'complete', imported: 0, errors: 1 });
        }
      }
      jobListeners.delete(job.id);
      tempSessions.delete(tempId);
      void cleanupDir(session.dir);
    });

    res.status(202).json({ jobId: job.id });
  },
);

// GET /api/admin/import/:id/progress — SSE stream
importRouter.get(
  '/:id/progress',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const jobId = req.params.id as string;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const listener = (event: ProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'complete') {
        res.end();
      }
    };

    if (!jobListeners.has(jobId)) {
      jobListeners.set(jobId, new Set());
    }
    jobListeners.get(jobId)!.add(listener);

    // Check if job is already complete
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      res.write(`data: ${JSON.stringify({ type: 'complete', imported: job.importedCount, errors: (job.errorLog as any[]).length })}\n\n`);
      res.end();
      return;
    }

    req.on('close', () => {
      const listeners = jobListeners.get(jobId);
      if (listeners) {
        listeners.delete(listener);
      }
    });
  },
);

// GET /api/admin/import/:id — job detail
importRouter.get(
  '/:id',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, req.params.id as string));
    if (!job) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    res.json(job);
  },
);

// GET /api/admin/import — list all import jobs
importRouter.get(
  '/',
  authMiddleware,
  requireRole('admin'),
  async (_req, res) => {
    const jobs = await db.select().from(importJobs).orderBy(desc(importJobs.createdAt));
    res.json(jobs);
  },
);
```

**Step 4: Run tests**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/admin/import.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/api/src/routes/admin/import.ts apps/api/src/__tests__/routes/admin/import.test.ts
git commit -m "feat: add import execute endpoint with SSE progress streaming"
```

---

### Task 10: Add bulk publish endpoint

**Files:**
- Modify: `apps/api/src/routes/admin/import.ts` (or create separate file)
- Create: `apps/api/src/__tests__/routes/admin/bulk-publish.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/api/src/__tests__/routes/admin/bulk-publish.test.ts
import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../../helpers/token.js';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { app } from '../../../app.js';
import { db } from '@dovetail/db';

describe('POST /api/admin/articles/bulk-publish', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  it('returns 403 for non-admin users', async () => {
    const res = await supertest(app)
      .post('/api/admin/articles/bulk-publish')
      .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('publishes all draft articles when no importJobId given', async () => {
    const updateChain = createChain([{ id: '1' }, { id: '2' }]);
    (db.update as Mock).mockReturnValue(updateChain);

    const res = await supertest(app)
      .post('/api/admin/articles/bulk-publish')
      .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/admin/bulk-publish.test.ts`

**Step 3: Write the implementation**

Create `apps/api/src/routes/admin/bulk-publish.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, articles } from '@dovetail/db';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validateBody } from '../../utils/validate.js';

export const bulkPublishRouter: Router = Router();

const bulkPublishSchema = z.object({
  importJobId: z.string().uuid().optional(),
});

bulkPublishRouter.post(
  '/',
  authMiddleware,
  requireRole('admin'),
  validateBody(bulkPublishSchema),
  async (req, res) => {
    const { importJobId } = req.body;
    const now = new Date();

    // Build WHERE clause: status = 'draft' AND optionally filter by authorId from import job
    // For import-scoped publish, we match articles created by the import
    // (import sets authorId to the admin who ran it, and we can filter by createdAt range from the job)
    let whereClause;
    if (importJobId) {
      // Get job details to scope the publish
      const { importJobs } = await import('@dovetail/db');
      const [job] = await db.select().from(importJobs).where(eq(importJobs.id, importJobId));
      if (!job) {
        res.status(404).json({ error: 'Import job not found' });
        return;
      }
      whereClause = sql`${articles.status} = 'draft' AND ${articles.authorId} = ${job.createdBy} AND ${articles.createdAt} >= ${job.createdAt}`;
    } else {
      whereClause = eq(articles.status, 'draft');
    }

    const updated = await db.update(articles)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(whereClause)
      .returning({ id: articles.id });

    res.json({ published: updated.length });
  },
);
```

**Step 4: Mount in app.ts**

Add to `apps/api/src/app.ts`:

```typescript
import { bulkPublishRouter } from './routes/admin/bulk-publish.js';
app.use('/api/admin/articles/bulk-publish', bulkPublishRouter);
```

**Step 5: Run tests**

Run: `cd apps/api && pnpm vitest run src/__tests__/routes/admin/bulk-publish.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/routes/admin/bulk-publish.ts apps/api/src/app.ts apps/api/src/__tests__/routes/admin/bulk-publish.test.ts
git commit -m "feat: add bulk publish endpoint for draft articles"
```

---

## Phase 3: Admin UI

### Task 11: Create the file dropzone component

**Files:**
- Create: `apps/web/components/FileDropzone.tsx`

**Step 1: Write the component**

```tsx
// apps/web/components/FileDropzone.tsx
'use client';

import { useCallback, useState, useRef } from 'react';

interface FileDropzoneProps {
  accept?: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function FileDropzone({ accept = '.zip', onFileSelected, disabled }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  }, [onFileSelected, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        isDragging ? 'border-accent bg-accent/5' : 'border-border-light hover:border-accent/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
      <p className="text-ink-muted text-sm font-[family-name:var(--font-ui)]">
        Drag & drop a ZIP file here, or click to browse
      </p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/components/FileDropzone.tsx
git commit -m "feat: add FileDropzone component"
```

---

### Task 12: Create the category tree preview component

**Files:**
- Create: `apps/web/components/CategoryTreePreview.tsx`

**Step 1: Write the component**

```tsx
// apps/web/components/CategoryTreePreview.tsx
'use client';

import { useState } from 'react';

interface CategoryNode {
  sourceId: string;
  name: string;
  children: CategoryNode[];
  articleCount: number;
}

interface CategoryTreePreviewProps {
  tree: CategoryNode[];
}

function TreeNode({ node, depth = 0 }: { node: CategoryNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-parchment-warm/50 cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span className="text-xs text-ink-muted w-4">
            {expanded ? '\u25BE' : '\u25B8'}
          </span>
        )}
        {!hasChildren && <span className="w-4" />}
        <span className="text-sm font-[family-name:var(--font-ui)]">{node.name}</span>
        <span className="text-xs text-ink-muted ml-auto">
          {node.articleCount} {node.articleCount === 1 ? 'article' : 'articles'}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.sourceId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTreePreview({ tree }: CategoryTreePreviewProps) {
  return (
    <div className="border border-border-light rounded-lg p-3 max-h-80 overflow-y-auto">
      {tree.map((node) => (
        <TreeNode key={node.sourceId} node={node} />
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/components/CategoryTreePreview.tsx
git commit -m "feat: add CategoryTreePreview component"
```

---

### Task 13: Build the admin import page

**Files:**
- Create: `apps/web/app/(main)/admin/import/page.tsx`
- Create: `apps/web/app/(main)/admin/import/ImportWizard.tsx`

**Step 1: Write the server page**

```tsx
// apps/web/app/(main)/admin/import/page.tsx
import RoleGate from '@/components/RoleGate';
import ImportWizard from './ImportWizard';

export default async function ImportPage() {
  return (
    <RoleGate minimumRole="admin" fallback={<p>Admin access required.</p>}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-[family-name:var(--font-display)] text-ink mb-6">Import Content</h1>
        <ImportWizard />
      </div>
    </RoleGate>
  );
}
```

**Step 2: Write the client wizard component**

```tsx
// apps/web/app/(main)/admin/import/ImportWizard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { apiClientFetch } from '@/lib/api-client';
import FileDropzone from '@/components/FileDropzone';
import CategoryTreePreview from '@/components/CategoryTreePreview';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { useToast } from '@/lib/hooks/useToast';

type Step = 'upload' | 'preview' | 'importing' | 'complete';

interface PreviewData {
  tempId: string;
  summary: {
    articleCount: number;
    categoryCount: number;
    attachmentCount: number;
    categoryTree: any[];
  };
  warnings: { article: string; message: string }[];
}

interface ProgressEvent {
  type: 'progress' | 'error' | 'complete';
  imported?: number;
  total?: number;
  current?: string;
  article?: string;
  message?: string;
  errors?: number;
}

export default function ImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<'draft' | 'published'>('draft');
  const [progress, setProgress] = useState<{ imported: number; total: number; current: string }>({ imported: 0, total: 0, current: '' });
  const [errors, setErrors] = useState<{ article: string; message: string }[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const toast = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleFileSelected = async (file: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/import/preview', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Upload failed');
      }

      const data: PreviewData = await res.json();
      setPreview(data);
      setStep('preview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const res = await apiClientFetch<{ jobId: string }>('/api/admin/import/execute', {
        method: 'POST',
        body: JSON.stringify({
          tempId: preview.tempId,
          options: { defaultStatus },
        }),
      });
      setJobId(res.jobId);
      setStep('importing');
      setProgress({ imported: 0, total: preview.summary.articleCount, current: '' });

      // Connect SSE
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const es = new EventSource(`${apiUrl}/api/admin/import/${res.jobId}/progress`, { withCredentials: true });
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data: ProgressEvent = JSON.parse(event.data);
        if (data.type === 'progress') {
          setProgress({ imported: data.imported!, total: data.total!, current: data.current! });
        } else if (data.type === 'error') {
          setErrors((prev) => [...prev, { article: data.article!, message: data.message! }]);
        } else if (data.type === 'complete') {
          setProgress((prev) => ({ ...prev, imported: data.imported! }));
          setStep('complete');
          es.close();
        }
      };

      es.onerror = () => {
        es.close();
        toast.error('Lost connection to import progress stream');
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start import');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPublish = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await apiClientFetch<{ published: number }>('/api/admin/articles/bulk-publish', {
        method: 'POST',
        body: JSON.stringify({ importJobId: jobId }),
      });
      toast.success(`Published ${res.published} articles`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Upload Export</h2>
          <p className="text-sm text-ink-muted mb-4 font-[family-name:var(--font-ui)]">
            Upload a ZIP file exported from Flowlu Knowledge Base.
          </p>
          <FileDropzone onFileSelected={handleFileSelected} disabled={loading} />
          {loading && (
            <p className="text-sm text-ink-muted mt-3 font-[family-name:var(--font-ui)]">Parsing export...</p>
          )}
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && preview && (
        <>
          <Card>
            <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Import Preview</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-semibold text-ink">{preview.summary.articleCount}</p>
                <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] uppercase tracking-wider">Articles</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-ink">{preview.summary.categoryCount}</p>
                <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] uppercase tracking-wider">Categories</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold text-ink">{preview.summary.attachmentCount}</p>
                <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] uppercase tracking-wider">Attachments</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted mb-3">Category Structure</h3>
            <CategoryTreePreview tree={preview.summary.categoryTree} />
          </Card>

          {preview.warnings.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold font-[family-name:var(--font-ui)] uppercase tracking-wider text-danger mb-3">Warnings ({preview.warnings.length})</h3>
              <ul className="text-sm space-y-1">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-ink-muted">
                    <span className="font-medium text-ink">{w.article}:</span> {w.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted mb-3">Import Options</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm font-[family-name:var(--font-ui)] text-ink">Default status:</span>
              <select
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value as 'draft' | 'published')}
                className="border border-border rounded px-3 py-1.5 text-sm bg-parchment font-[family-name:var(--font-ui)]"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <div className="mt-4 flex gap-3">
              <Button onClick={handleStartImport} loading={loading}>
                Start Import
              </Button>
              <Button variant="secondary" onClick={() => { setStep('upload'); setPreview(null); }}>
                Cancel
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <Card>
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Importing...</h2>
          <div className="w-full bg-border-light rounded-full h-3 mb-3">
            <div
              className="bg-accent h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.imported / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-sm text-ink font-[family-name:var(--font-ui)]">
            {progress.imported} / {progress.total} articles
          </p>
          {progress.current && (
            <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
              Current: {progress.current}
            </p>
          )}
          {errors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-danger font-[family-name:var(--font-ui)] uppercase tracking-wider mb-2">{errors.length} Errors</p>
              <ul className="text-xs text-ink-muted max-h-32 overflow-y-auto space-y-1">
                {errors.map((e, i) => (
                  <li key={i}><span className="font-medium text-ink">{e.article}:</span> {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <Card>
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Import Complete</h2>
          <p className="text-sm text-ink font-[family-name:var(--font-ui)] mb-2">
            Successfully imported {progress.imported} articles.
          </p>
          {errors.length > 0 && (
            <p className="text-sm text-danger font-[family-name:var(--font-ui)] mb-4">
              {errors.length} articles had errors.
            </p>
          )}
          <div className="flex gap-3">
            {defaultStatus === 'draft' && (
              <Button onClick={handleBulkPublish} loading={loading}>
                Publish All
              </Button>
            )}
            <Button variant="secondary" onClick={() => { setStep('upload'); setPreview(null); setErrors([]); }}>
              Import Another
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/app/\(main\)/admin/import/ apps/web/components/FileDropzone.tsx apps/web/components/CategoryTreePreview.tsx
git commit -m "feat: add admin import page with upload, preview, progress UI"
```

---

### Task 14: Add import link to admin dashboard

**Files:**
- Modify: `apps/web/app/(main)/admin/page.tsx`

**Step 1: Add an Import card to the admin dashboard**

Find the existing admin cards section (Users, API Keys, Tags) and add an Import card in the same pattern:

```tsx
<Link href="/admin/import" className="...same classes as other cards...">
  <h2>Import</h2>
  <p>Import content from external knowledge bases</p>
</Link>
```

Match the exact styling of the existing admin dashboard cards.

**Step 2: Commit**

```bash
git add apps/web/app/\(main\)/admin/page.tsx
git commit -m "feat: add import link to admin dashboard"
```

---

### Task 15: Configure Next.js API proxy for multipart uploads

**Files:**
- Modify: `apps/web/next.config.ts` (or `.js`)

The frontend needs to proxy `/api/admin/import/preview` to the Express API, including multipart file uploads. Check the existing Next.js config for how API routes are proxied (likely via `rewrites`). Ensure the multipart upload is passed through without Next.js body parsing interfering.

The SSE endpoint (`/api/admin/import/:id/progress`) also needs to be proxied. Ensure the proxy config doesn't buffer SSE responses.

**Step 1: Check existing proxy config and update if needed**

Read `apps/web/next.config.ts` and add/update the rewrite rules to include the import endpoints.

**Step 2: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "chore: configure API proxy for import endpoints"
```

---

### Task 16: End-to-end integration test

**Files:**
- Create: `apps/api/src/__tests__/services/import-integration.test.ts`

**Step 1: Write an integration test using the actual sample data**

This test uses the real `sample-import/` directory to validate the full pipeline:
1. Parse `data.json`
2. Extract HTML bodies
3. Convert to TipTap JSON
4. Verify the output is valid

```typescript
// apps/api/src/__tests__/services/import-integration.test.ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseDataJson, buildCategoryTree } from '../../services/import/flowlu-parser.js';
import { extractArticleBody, extractDateModified } from '../../services/import/html-extractor.js';
import { htmlToTiptap } from '../../services/import/html-to-tiptap.js';

const SAMPLE_DIR = path.resolve(__dirname, '../../../../../sample-import');

describe('Import integration (sample data)', () => {
  it('parses data.json from sample export', () => {
    const json = fs.readFileSync(path.join(SAMPLE_DIR, 'assets', 'data.json'), 'utf-8');
    const articles = parseDataJson(json);
    expect(articles.length).toBeGreaterThan(300);
    expect(articles[0]).toHaveProperty('title');
    expect(articles[0]).toHaveProperty('slug');
    expect(articles[0]).toHaveProperty('parentChain');
  });

  it('builds a category tree with expected structure', () => {
    const json = fs.readFileSync(path.join(SAMPLE_DIR, 'assets', 'data.json'), 'utf-8');
    const articles = parseDataJson(json);
    const tree = buildCategoryTree(articles);
    expect(tree.length).toBeGreaterThan(10);
    // Consumer Debt Collection should be in the tree
    const cdc = tree.find(n => n.name === 'Consumer Debt Collection');
    expect(cdc).toBeDefined();
    expect(cdc!.children.length).toBeGreaterThan(0);
  });

  it('extracts article body from a sample HTML file', () => {
    const html = fs.readFileSync(path.join(SAMPLE_DIR, 'articles', '1020--mdec-resources', 'index.html'), 'utf-8');
    const body = extractArticleBody(html);
    expect(body).toContain('Help Center staff frequently field questions');
    expect(body.length).toBeGreaterThan(100);
  });

  it('extracts dateModified from a sample HTML file', () => {
    const html = fs.readFileSync(path.join(SAMPLE_DIR, 'articles', '1020--mdec-resources', 'index.html'), 'utf-8');
    const date = extractDateModified(html);
    expect(date).toBeTruthy();
    expect(new Date(date!).getFullYear()).toBeGreaterThanOrEqual(2023);
  });

  it('converts a sample article body to valid TipTap JSON', () => {
    const html = fs.readFileSync(path.join(SAMPLE_DIR, 'articles', '1020--mdec-resources', 'index.html'), 'utf-8');
    const body = extractArticleBody(html);
    const tiptap = htmlToTiptap(body);
    expect(tiptap.type).toBe('doc');
    expect(tiptap.content.length).toBeGreaterThan(0);
    // Should contain paragraphs
    const paragraphs = tiptap.content.filter((n: any) => n.type === 'paragraph');
    expect(paragraphs.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run the integration tests**

Run: `cd apps/api && pnpm vitest run src/__tests__/services/import-integration.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add apps/api/src/__tests__/services/import-integration.test.ts
git commit -m "test: add import integration tests against sample data"
```

---

### Task 17: Run full test suite and fix any issues

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All existing + new tests pass

**Step 2: Fix any failures**

If existing tests break due to new imports in `app.ts` or schema changes, update the mocks accordingly.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test issues from import feature integration"
```
