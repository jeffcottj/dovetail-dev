# Import Feature Design

## Overview

A reusable admin feature to import content from Flowlu Knowledge Base exports into Dovetail. Admins upload a ZIP of the export through the admin UI, preview what will be imported, then kick off a background import job with progress tracking.

## Source Format (Flowlu KB Export)

- `data.json` — article map keyed by numeric ID, each with `title`, `code` (encodes hierarchy), `index` (search text), `tags`
- `articles/{code}/index.html` — full HTML pages with structured Schema.org markup: breadcrumbs, `dateModified`, `articleBody`
- `assets/images/{id}/` — attached files (PDFs, images, DOCX) organized by article ID
- Hierarchy encoded in the `code` field: `parentId-childId--slug` (e.g., `11-14-15--hoa-coa-md-contract-lien-act` means article 15 is child of 14, child of 11)
- 30 top-level categories, up to 5 levels deep, 338 articles, 968 tags

## Decisions

- **Reusable admin feature** — not a one-time script
- **Rich HTML-to-TipTap conversion** — headings, bold/italic, links, lists, tables, images, blockquotes
- **Local disk file storage** — `uploads/` directory, easy to migrate to S3 later
- **Import as draft by default** — admin can toggle to "published" in the import UI
- **Bulk publish** — separate action to publish all drafts from a specific import batch
- **Skip tags** — not imported in this version
- **Store attachments** — copy files from export to `uploads/attachments/`, create `attachments` rows

## Data Flow

1. Admin navigates to `/admin/import`, selects a ZIP file
2. Frontend uploads ZIP to `POST /api/admin/import/preview` (multipart/form-data)
3. API extracts ZIP to `uploads/import-temp/{uuid}/`, parses `data.json` + HTML files, returns summary
4. Admin reviews preview (category tree, article counts, warnings), chooses default status (draft/published), clicks "Start Import"
5. Frontend calls `POST /api/admin/import/execute` with temp ID and options
6. API creates an `import_jobs` row, runs import as background task, streams progress via SSE (`GET /api/admin/import/:id/progress`)
7. Frontend shows progress bar with per-article status
8. On completion, temp files cleaned up

Temp directory lifecycle: created on preview, identified by UUID. Cleaned up after import completes or after 1-hour TTL.

## Data Model Changes

### New table: `attachments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| article_id | uuid FK → articles | nullable (orphaned files) |
| filename | text | original filename |
| storage_path | text | relative path, e.g. `uploads/attachments/abc123.pdf` |
| mime_type | text | |
| size_bytes | integer | |
| created_at | timestamp | |

### New table: `import_jobs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| status | text | pending, running, completed, failed |
| created_by | uuid FK → users | |
| total_articles | integer | |
| imported_count | integer | updated during import |
| error_log | jsonb | array of `{ article_title, error_message }` |
| options | jsonb | `{ defaultStatus: 'draft' | 'published' }` |
| created_at | timestamp | |
| completed_at | timestamp | nullable |

### File storage layout

```
uploads/
  attachments/          # imported + future uploaded files
    {uuid}.{ext}        # named by attachment ID
  import-temp/          # extracted ZIPs, cleaned up after import
    {job-id}/
```

No changes to existing tables. Imported articles use existing `articles`, `categories`, and `article_versions` tables. `authorId` is set to the admin who performed the import.

## Import Parsing Pipeline

1. **Read `data.json`** — extract article map keyed by ID
2. **Derive category tree from `code` fields** — `11-14-15--slug` means article 15 is child of 14, child of 11. Look up ancestor IDs in the article map to get category titles. Articles that are also categories (e.g., "Consumer Debt Collection") become both a category and an article within that category.
3. **Parse each `index.html`** — extract `<div itemprop="articleBody">` and `<meta itemprop="dateModified">`
4. **Convert HTML body to TipTap JSON** — using `@tiptap/html` or ProseMirror parser. Supported: headings, paragraphs, bold/italic/underline, links, lists, tables, images, blockquotes, horizontal rules. Unsupported elements convert to plain text with a warning.
5. **Copy attachment files** — for each article ID with a matching `assets/images/{id}/` directory, copy files to `uploads/attachments/` and create `attachments` rows.
6. **Slug generation** — use the slug portion of `code` (after `--`). Collisions handled with timestamp suffix.
7. **Category deduplication** — reuse existing categories at the same tree position. Makes re-imports safe.
8. **Article deduplication** — skip articles with duplicate slugs, log a warning. No upsert.

## API Endpoints

All admin-only (`authMiddleware` + `requireRole('admin')`).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/import/preview` | Upload ZIP, parse, return summary |
| POST | `/api/admin/import/execute` | Start import job with options |
| GET | `/api/admin/import/:id/progress` | SSE stream of import progress |
| GET | `/api/admin/import/:id` | Get import job status/result |
| GET | `/api/admin/import` | List past import jobs |
| POST | `/api/admin/articles/bulk-publish` | Publish all drafts, optionally scoped to import job |

### Preview response

```json
{
  "tempId": "uuid",
  "summary": {
    "articleCount": 338,
    "categoryCount": 30,
    "attachmentCount": 257,
    "categoryTree": [{ "name": "...", "children": [...], "articleCount": 5 }]
  },
  "warnings": [{ "article": "...", "message": "..." }]
}
```

### Execute request

```json
{
  "tempId": "uuid",
  "options": { "defaultStatus": "draft" }
}
```

### SSE progress events

```
data: { "type": "progress", "imported": 42, "total": 338, "current": "Article Title" }
data: { "type": "error", "article": "Article Title", "message": "..." }
data: { "type": "complete", "imported": 335, "errors": 3 }
```

### Bulk publish request

```json
{
  "importJobId": "uuid"
}
```

Omit `importJobId` to publish ALL drafts.

## Admin UI

### Route: `/admin/import`

**Step 1 — Upload:**
- Card with file dropzone accepting `.zip` files
- "Upload & Preview" button

**Step 2 — Preview:**
- Summary card: total articles, categories, attachments
- Collapsible category tree with article counts per category
- Warnings section (if any)
- Status toggle: "Import as Draft" (default) / "Import as Published"
- "Start Import" button

**Step 3 — Progress:**
- Progress bar with `{imported_count} / {total_articles}`
- Scrolling log of imported articles
- On completion: success summary, link to browse content
- If errors: expandable error log

### Bulk Publish

"Publish All Drafts" button available after import completes (scoped to that import batch via `importJobId`). Also usable from a general admin context to publish all drafts.

## Implementation Phases

### Phase 1 — Foundation (file storage + schema + parsing)

- Add `attachments` and `import_jobs` tables + Drizzle migration
- Set up `uploads/` directory structure and file storage utility
- Build Flowlu parser: `data.json` reader, HTML body extractor, category tree builder
- Build HTML-to-TipTap JSON converter
- Unit tests for parser and converter

### Phase 2 — API endpoints + import engine

- `POST /api/admin/import/preview` (ZIP upload, parse, return summary)
- `POST /api/admin/import/execute` (background import job)
- `GET /api/admin/import/:id/progress` (SSE)
- `GET /api/admin/import/:id` and `GET /api/admin/import` (job history)
- `POST /api/admin/articles/bulk-publish`
- Import engine: category creation, article insertion, attachment copying, deduplication, error handling
- Temp directory lifecycle management (cleanup on completion + 1-hour TTL)
- Integration tests

### Phase 3 — Admin UI

- `/admin/import` page with upload, preview, progress flow
- File dropzone component
- Category tree preview component
- Import progress view with SSE
- Bulk publish UI
- Wire up to API endpoints
