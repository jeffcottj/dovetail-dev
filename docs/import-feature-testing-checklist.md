# Import Feature — Manual Testing Checklist

Local testing guide for the Flowlu KB import feature (`feature/import-feature` branch).

## Prerequisites

1. **Start the dev stack:**

   ```bash
   docker compose up postgres -d   # Postgres in Docker
   pnpm dev                        # API on :3001, Web on :3000
   ```

2. **Create a test ZIP from the sample data:**

   ```bash
   cd sample-import
   zip -r ../test-export.zip articles/ assets/
   cd ..
   ```

   This produces `test-export.zip` at the repo root (~the file you'll upload).

3. **Log in as an admin user** at `http://localhost:3000`. You need a user with `role = 'admin'` in the database.

---

## 1. Database Schema

### 1.1 Verify new tables exist

```bash
pnpm --filter @dovetail/db db:studio
```

Open Drizzle Studio and confirm these tables exist:

- **`attachments`** — columns: `id`, `article_id`, `filename`, `storage_path`, `mime_type`, `size_bytes`, `created_at`
- **`import_jobs`** — columns: `id`, `status`, `created_by`, `total_articles`, `imported_count`, `error_log`, `options`, `created_at`, `completed_at`
- **`import_status` enum** — values: `pending`, `running`, `completed`, `failed`

### 1.2 Verify foreign keys

In Drizzle Studio, confirm:
- `attachments.article_id` references `articles.id` with `ON DELETE SET NULL`
- `import_jobs.created_by` references `users.id`

---

## 2. Admin Dashboard Link

### 2.1 Import card appears

1. Go to `http://localhost:3000/admin`
2. Verify a fourth card titled **"Import"** appears in the feature grid alongside Users, API Keys, and Tags
3. Verify the description reads "Import content from external knowledge bases."
4. Click the card — it should navigate to `/admin/import`

### 2.2 Non-admin cannot access

1. Log in as an `editor` or `viewer` user
2. Navigate to `http://localhost:3000/admin/import`
3. Verify you see "Admin access required." (not the import wizard)

---

## 3. Upload & Preview (Step 1 → Step 2)

### 3.1 Upload screen renders

1. Go to `/admin/import`
2. Verify you see a card titled **"Upload Export"** with a dashed-border dropzone
3. Verify the dropzone text reads "Drag & drop a ZIP file here, or click to browse"

### 3.2 Upload via click

1. Click the dropzone area
2. Select `test-export.zip` from the file picker
3. Verify "Parsing export..." appears briefly
4. Verify the page transitions to the Preview step (3 stat cards appear)

### 3.3 Upload via drag & drop

1. Click "Cancel" to return to the upload step
2. Drag `test-export.zip` onto the dropzone
3. Verify the border changes color on drag-over (accent highlight)
4. Drop the file — verify it transitions to Preview

### 3.4 Preview summary is accurate

On the Preview step, verify:

- **Articles** count matches the number of entries in `sample-import/assets/data.json` (should be 349)
- **Categories** count is greater than 10
- **Attachments** count reflects files under `sample-import/assets/images/`

### 3.5 Category tree preview

1. Verify the "Category Structure" card shows a collapsible tree
2. Top-level categories should be visible (e.g., "Consumer Debt Collection", "Family Law")
3. Click a category with a `▸` arrow — verify it expands to show children
4. Click again — verify it collapses
5. Each node should show an article count on the right

### 3.6 Warnings display

If any articles in the ZIP lack an `index.html` file, a **Warnings** card should appear listing them. Verify the format: `Article Title: No HTML file found; article will be imported with empty content`.

### 3.7 Import options

1. Verify the "Import Options" card has a dropdown for **Default status** with options "Draft" and "Published"
2. Default should be "Draft"
3. Verify **Start Import** and **Cancel** buttons are present

### 3.8 Cancel returns to upload

1. Click **Cancel**
2. Verify the wizard resets to the Upload step

### 3.9 Invalid file handling

1. Upload a non-ZIP file (e.g., rename a `.txt` to `.zip` or upload a random file)
2. Verify a toast error appears with a message like "Failed to parse export: ..."
3. The wizard should stay on the Upload step

---

## 4. Import Execution (Step 2 → Step 3)

### 4.1 Start import as draft

1. Upload `test-export.zip` and reach the Preview step
2. Leave status as "Draft"
3. Click **Start Import**
4. Verify the wizard transitions to the **Importing** step

### 4.2 Progress bar updates

On the Importing step:

1. Verify a progress bar appears and fills from left to right
2. Verify the counter shows `X / Y articles` and increments
3. Verify the "Current: ..." label updates with each article title
4. The bar should reach 100% when all articles are processed

### 4.3 Errors are displayed inline

If any articles fail to import (e.g., duplicate slugs on a second run), verify:

- An "Errors" section appears below the progress bar
- Each error shows the article title and error message
- The import continues despite individual article errors

### 4.4 Completion screen

When the import finishes:

1. Verify the wizard transitions to the **Import Complete** step
2. Verify it shows "Successfully imported N articles."
3. If there were errors, verify "N articles had errors." appears in red
4. Verify **Publish All** button appears (since we imported as draft)
5. Verify **Import Another** button appears

---

## 5. Bulk Publish (Step 4)

### 5.1 Publish imported drafts

1. After a draft import completes, click **Publish All**
2. Verify a success toast appears: "Published N articles"
3. Open Drizzle Studio or the articles page — verify the imported articles now have `status = 'published'`

### 5.2 Published import skips bulk publish button

1. Start a fresh import (click **Import Another**)
2. Upload `test-export.zip` again
3. On the Preview step, change the default status to **Published**
4. Click **Start Import** and wait for completion
5. Verify the **Publish All** button does NOT appear (articles are already published)

---

## 6. Imported Data Integrity

### 6.1 Categories created correctly

1. Go to the main site sidebar or `/api/categories`
2. Verify categories from the Flowlu export exist (e.g., "Consumer Debt Collection")
3. Verify parent-child nesting is correct (subcategories appear under their parents)

### 6.2 Articles have content

1. Navigate to an imported article in the UI
2. Verify the article body renders (paragraphs, headings, lists, links, etc.)
3. Verify it's not blank — the HTML was converted to TipTap JSON

### 6.3 Article metadata

Pick a few imported articles and verify:

- **Title** matches the Flowlu export
- **Slug** is derived from the Flowlu `code` field
- **Category** assignment is correct (matches the hierarchy)
- **Author** is set to the admin who ran the import
- **Status** matches the chosen default (draft or published)

### 6.4 Attachments copied

1. Check `apps/api/uploads/attachments/` on disk — verify image files were copied
2. In Drizzle Studio, check the `attachments` table:
   - Rows should exist with correct `article_id`, `filename`, `mime_type`, `size_bytes`
   - `storage_path` should point to `uploads/attachments/{uuid}.{ext}`

### 6.5 Category deduplication

1. Run the import a second time (click **Import Another**, upload the same ZIP)
2. After import, verify categories were **reused** (not duplicated) — check `/api/categories` for duplicates
3. Articles should fail with "slug already exists" errors (expected — confirms dedup on articles too)

---

## 7. API Endpoints (Direct)

Test these with `curl` or a REST client. Replace `$COOKIE` with your admin session cookie.

### 7.1 POST /api/admin/import/preview

```bash
curl -X POST http://localhost:3001/api/admin/import/preview \
  -H "Cookie: $COOKIE" \
  -F "file=@test-export.zip"
```

Verify: 200 response with `tempId`, `summary`, and `warnings`.

### 7.2 POST /api/admin/import/execute

```bash
curl -X POST http://localhost:3001/api/admin/import/execute \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"tempId":"<tempId-from-preview>","options":{"defaultStatus":"draft"}}'
```

Verify: 202 response with `jobId`.

### 7.3 GET /api/admin/import/:id/progress (SSE)

```bash
curl -N http://localhost:3001/api/admin/import/<jobId>/progress \
  -H "Cookie: $COOKIE"
```

Verify: Stream of `data: {...}` events ending with a `complete` event.

### 7.4 GET /api/admin/import/:id

```bash
curl http://localhost:3001/api/admin/import/<jobId> \
  -H "Cookie: $COOKIE"
```

Verify: Full job record with `status`, `importedCount`, `errorLog`, etc.

### 7.5 GET /api/admin/import

```bash
curl http://localhost:3001/api/admin/import \
  -H "Cookie: $COOKIE"
```

Verify: Array of all import jobs, newest first.

### 7.6 POST /api/admin/articles/bulk-publish

```bash
curl -X POST http://localhost:3001/api/admin/articles/bulk-publish \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"importJobId":"<jobId>"}'
```

Verify: `{ "published": N }`.

### 7.7 Auth gating

Repeat any endpoint above without a cookie or with an editor/viewer cookie:

```bash
curl -X POST http://localhost:3001/api/admin/import/preview
```

Verify: 401 (no cookie) or 403 (non-admin).

---

## 8. Edge Cases

### 8.1 Session expiration

1. Upload a ZIP via the preview endpoint
2. Wait 1+ hour (or temporarily set `SESSION_TTL_MS` to a short value like 5000ms in `apps/api/src/routes/admin/import.ts` for testing)
3. Try to execute the import with the expired `tempId`
4. Verify: 404 response "Import session not found or expired"

### 8.2 Empty ZIP

1. Create an empty ZIP: `zip empty.zip --junk-paths /dev/null && zip -d empty.zip -`
2. Upload it
3. Verify: 400 error about failing to parse the export

### 8.3 ZIP without data.json

1. Create a ZIP with random files (no `assets/data.json`)
2. Upload it
3. Verify: 400 error about failing to parse

### 8.4 Large import resilience

The sample data has 349 articles. Verify the import completes without hanging or crashing. Watch the API terminal for memory/error output.

---

## 9. Automated Tests

### 9.1 Run all API tests

```bash
cd apps/api && pnpm vitest run
```

Verify: All tests pass (24 files, 158 tests).

### 9.2 Run import-specific tests

```bash
cd apps/api && pnpm vitest run src/__tests__/services/import-integration.test.ts
cd apps/api && pnpm vitest run src/__tests__/services/flowlu-parser.test.ts
cd apps/api && pnpm vitest run src/__tests__/services/html-to-tiptap.test.ts
cd apps/api && pnpm vitest run src/__tests__/services/html-extractor.test.ts
cd apps/api && pnpm vitest run src/__tests__/services/import-engine.test.ts
cd apps/api && pnpm vitest run src/__tests__/routes/admin/import.test.ts
cd apps/api && pnpm vitest run src/__tests__/routes/admin/bulk-publish.test.ts
cd apps/api && pnpm vitest run src/__tests__/utils/storage.test.ts
```

### 9.3 Type check the frontend

```bash
pnpm --filter @dovetail/web exec tsc --noEmit
```

Verify: No type errors.

---

## Cleanup After Testing

```bash
# Remove the test ZIP
rm -f test-export.zip

# Remove uploaded attachments and temp files
rm -rf apps/api/uploads/

# (Optional) Clear imported data from the database
# Use Drizzle Studio to delete rows from: attachments, articles (imported ones), categories (imported ones), import_jobs
```
