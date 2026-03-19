# Import Feature — Test Results

**Date:** 2026-03-18
**Branch:** `feature/import-feature`
**Environment:** Fresh `db-reset` + `seed` + `dev` (Docker Postgres, API :3001, Web :3000)
**Test data:** `sample-import/kb_1_17032026_1001.zip` (338 articles, 225 attachments)

---

## Summary

| Section | Result | Notes |
|---------|--------|-------|
| 1. Database Schema | PASS | All tables, columns, enums, and foreign keys correct |
| 2. Admin Dashboard Link | PASS | Import card present; non-admin blocked |
| 3. Upload & Preview | PASS | Upload, preview stats, category tree, cancel, invalid file all work |
| 4. Import Execution | PASS | Progress updates, completion screen correct |
| 5. Bulk Publish | PASS | Publishes all drafts; Published import hides Publish All button |
| 6. Data Integrity | PASS (with caveat) | Content, metadata, attachments correct; **category dedup fails** |
| 7. API Endpoints | PASS | All 7 endpoint tests pass |
| 8. Edge Cases | PASS | Expired session, empty ZIP, no data.json all handled correctly |
| 9. Automated Tests | PASS | 26 files, 167 tests pass; `tsc --noEmit` clean |

**Overall: PASS with 1 bug found (category deduplication)**

---

## Detailed Results

### 1. Database Schema

- **1.1 Tables exist:** `attachments` (id, article_id, filename, storage_path, mime_type, size_bytes, created_at) and `import_jobs` (id, status, created_by, total_articles, imported_count, error_log, options, created_at, completed_at) both present.
- **1.2 Enum:** `import_status` has values: pending, running, completed, failed.
- **1.3 Foreign keys:** `attachments.article_id` → `articles.id` ON DELETE SET NULL; `import_jobs.created_by` → `users.id`. Both confirmed.

### 2. Admin Dashboard Link

- **2.1 Import card:** Fourth card on `/admin` titled "Import" with description "Import content from external knowledge bases." Links to `/admin/import`. **PASS**
- **2.2 Non-admin access:** Editor user sees "Admin access required." on `/admin/import`. **PASS**

### 3. Upload & Preview

- **3.1 Upload screen:** Shows "Upload Export" card with dropzone text "Drag & drop a ZIP file here, or click to browse". **PASS**
- **3.2 Upload via click:** File upload triggers preview. **PASS**
- **3.3 Upload via drag & drop:** Not tested (headless browser limitation).
- **3.4 Preview summary:** Articles: 338, Categories: 338, Attachments: 225. **PASS**
- **3.5 Category tree:** Collapsible tree with expand/collapse arrows (▾/▸), article counts per node. Top-level categories visible (Expungements, Consumer Debt Collection, Family Law, Housing, etc.). **PASS**
- **3.6 Warnings:** No warnings displayed (sample data is well-formed). Not directly testable without malformed data.
- **3.7 Import options:** "Default status" dropdown with Draft (selected) and Published. Start Import and Cancel buttons present. **PASS**
- **3.8 Cancel:** Returns to Upload step, dropzone reappears. **PASS**
- **3.9 Invalid file:** Uploading a non-ZIP file keeps wizard on Upload step (no transition to Preview). **PASS**

### 4. Import Execution

- **4.1 Start import as draft:** Wizard transitions to "Importing..." step showing "0 / 338 articles". **PASS**
- **4.2 Progress bar:** Counter shows article progress. Import completed quickly (~4 seconds for 338 articles). **PASS**
- **4.3 Errors inline:** Not triggered on first import (no errors). Second import also succeeded without slug errors (see bug below).
- **4.4 Completion screen:** Shows "Import Complete" → "Successfully imported 338 articles." with Publish All and Import Another buttons. **PASS**

### 5. Bulk Publish

- **5.1 Publish All:** Toast notification "Published 338 articles" appears. Database confirms 339 published (338 imported + 1 seed). **PASS**
- **5.2 Published import hides button:** After importing as Published, only "Import Another" appears (no "Publish All"). **PASS**

### 6. Data Integrity

- **6.1 Categories:** Created with correct parent-child nesting (e.g., Bankruptcy → Consumer Debt Collection, Name Changes → Family Law). **PASS**
- **6.2 Article content:** Rendered in browser with real text, paragraphs, headings. HTML was correctly converted to TipTap JSON. **PASS**
- **6.3 Article metadata:** Titles match Flowlu export, slugs derived from Flowlu `code` field, categories assigned correctly, author set to "Local Admin", status matches chosen default. **PASS**
- **6.4 Attachments:** 225 attachment records per import in DB. Files copied to `apps/api/uploads/attachments/` with UUID filenames. Records include correct `article_id`, `filename`, `mime_type`, `size_bytes`, and `storage_path`. **PASS**
- **6.5 Category deduplication:** **BUG FOUND** — See bug report below.

### 7. API Endpoints

| Endpoint | Method | Expected | Actual | Result |
|----------|--------|----------|--------|--------|
| `/api/admin/import/preview` | POST | 200 + tempId, summary, warnings | 200 + correct response | PASS |
| `/api/admin/import/execute` | POST | 202 + jobId | 202 + jobId | PASS |
| `/api/admin/import/:id/progress` | GET (SSE) | Stream of data events | `data: {"type":"complete","imported":338,"errors":0}` | PASS |
| `/api/admin/import/:id` | GET | Full job record | Correct status, counts, timestamps | PASS |
| `/api/admin/import` | GET | Array of jobs, newest first | 3 jobs listed correctly | PASS |
| `/api/admin/articles/bulk-publish` | POST | `{"published": N}` | `{"published": 338}` | PASS |
| Auth gating (no cookie) | POST | 401 | 401 `{"error":"Unauthorized"}` | PASS |

### 8. Edge Cases

- **8.1 Expired/invalid tempId:** Returns 404 "Import session not found or expired". **PASS**
- **8.2 Empty ZIP:** Returns 400 "The uploaded file could not be processed." **PASS**
- **8.3 ZIP without data.json:** Returns 400 "The uploaded file could not be processed." **PASS**
- **8.4 Large import resilience:** 338 articles imported in ~4 seconds across 3 separate runs. No hangs, crashes, or memory issues. **PASS**

### 9. Automated Tests

- **9.1 All API tests:** 26 files, 167 tests pass (3.15s). **PASS**
  - Note: `import-integration.test.ts` requires the sample ZIP to be extracted first (`unzip kb_1_17032026_1001.zip` in `sample-import/`). Without extraction, 5 tests fail with ENOENT.
- **9.2 Import-specific tests:** All pass (included in 9.1 run).
- **9.3 Frontend type check:** `tsc --noEmit` exits cleanly with no errors. **PASS**

---

## Bugs Found

### BUG: Category deduplication not working on re-import

**Severity:** Medium
**Checklist item:** 6.5

**Description:** When the same ZIP is imported a second time, the import engine creates duplicate categories instead of reusing existing ones. The checklist specifies that categories should be **reused** (deduplicated by name+parent) on subsequent imports.

**Steps to reproduce:**
1. Import `test-export.zip` as Draft → 338 articles, all succeed
2. Click "Import Another" → upload the same ZIP again → Start Import
3. Check categories table: duplicates exist

**Evidence:**
```
SELECT name, count(*) FROM categories GROUP BY name HAVING count(*) > 1 ORDER BY cnt DESC LIMIT 5;

 Baltimore City    | 5
 Prince George's   | 5
 Baltimore County  | 5
 Anne Arundel      | 4
 Charles           | 3
```

**Expected:** Categories with the same name and parent should be reused. Only articles should fail (due to slug uniqueness per category).

**Actual:** New category rows are created for every import, and articles are assigned to these new categories. Because slug uniqueness is per-category/parent, the duplicate categories allow duplicate articles to be created (with suffixed slugs like `expungement-mmwvjgv4`).

**Impact:** Running the import multiple times bloats the categories table and creates duplicate article entries. The sidebar becomes cluttered with duplicate category trees.

---

## Notes

- The testing checklist references 349 articles but the actual data.json contains 338 entries. The checklist should be updated.
- Drag-and-drop upload (3.3) was not tested due to headless browser limitations but the underlying file handling works correctly.
- The `sample-import/` directory must have the ZIP extracted for integration tests to pass. Consider either extracting as part of test setup or updating the README.
