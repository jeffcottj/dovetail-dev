# Step 9 Implementation Plan: Flowlu Import Completion

## Purpose

This plan covers step 9 from the suggested implementation order in `docs/product-gap-analysis.md`:

> Complete Flowlu import indexing/tags/KB-admin authorization.

The goal is for a KB admin to import a Flowlu ZIP into their knowledge base and have the resulting published content immediately available through tags, full-text search, semantic search, attachment search, and RAG without a manual reseed or separate indexing script.

## Current Behavior

Relevant current behavior in this branch:

- `apps/api/src/routes/admin/import.ts` mounts KB-scoped import endpoints under `/api/knowledge-bases/:kbId/admin/import`.
- The import router already uses `requireKbAdmin`, so global admins and KB-level admins can reach preview, execute, progress, detail, and list endpoints.
- `apps/api/src/services/import/flowlu-parser.ts` parses Flowlu `tags` from `assets/data.json` into `FlowluArticle`.
- `apps/api/src/services/import/import-engine.ts` creates categories, articles, and attachment rows, but it does not currently create KB-scoped tags or `article_tags` links from Flowlu tag data.
- Imported attachments are inserted with `extractionStatus: 'pending'` and passed to `enqueueAttachmentIndexing()`.
- Imported articles are not passed to `generateEmbeddings()`, so semantic search and RAG can miss imported article content until a separate reindex path runs.
- Full-text article search should work from `articles.plainText` and the database search-vector trigger once the row is inserted.
- `apps/web/app/(admin)/kb/[kbSlug]/admin/import/page.tsx` renders `ImportWizard`.
- `apps/web/components/ImportWizard.tsx` supports upload, preview, execute, SSE progress, completion, and bulk publish for draft imports.
- `GET /api/knowledge-bases/:kbId/admin/import` exists, but the current import page does not expose historical jobs outside the wizard flow.

Primary files to inspect before implementation:

- `apps/api/src/routes/admin/import.ts`
- `apps/api/src/services/import/import-engine.ts`
- `apps/api/src/services/import/flowlu-parser.ts`
- `apps/api/src/services/embedding-pipeline.ts`
- `apps/api/src/services/attachment-indexing.ts`
- `apps/api/src/routes/admin/bulk-publish.ts`
- `apps/api/src/__tests__/routes/admin/import.test.ts`
- `apps/api/src/__tests__/services/import-engine.test.ts`
- `apps/api/src/__tests__/services/import-integration.test.ts`
- `apps/api/src/__tests__/services/flowlu-parser.test.ts`
- `apps/web/components/ImportWizard.tsx`
- `apps/web/app/(admin)/kb/[kbSlug]/admin/import/page.tsx`
- `packages/db/src/schema.ts`
- `packages/types/src/index.ts`

## Product Semantics To Implement

- KB admins can preview, execute, monitor, inspect, and list imports for KBs where their effective KB role is `admin`.
- Non-admin users cannot run imports just because they can edit or view article content.
- Flowlu tags are normalized into KB-scoped `tags` rows and linked to imported articles through `article_tags`.
- Existing tags in the same KB are reused case-insensitively when possible; tags in other KBs are not reused.
- Imported published articles are immediately available to full-text search, semantic search, and RAG.
- Imported draft articles are indexed as needed for editor/admin search surfaces, but public/RAG endpoints continue to return only published articles.
- Imported attachments enter the attachment extraction/indexing queue and appear in attachment search/RAG once extraction succeeds.
- Import job history is visible from the KB import admin page, including status, article totals, imported count, error count, created time, completed time, default status, and the actor when available.
- Partial import failures are surfaced in job detail/history without marking successful article imports unusable.

## Reproduction Recipe

Before implementation:

1. Run `just dev`.
2. Log in at `/login` as `Local Admin`.
3. Ensure there is a KB admin test user, or assign `Local Editor` a KB-level `admin` role for one KB.
4. Log in as that KB admin and open `/kb/<kbSlug>/admin/import`.
5. Upload a Flowlu ZIP whose `assets/data.json` contains at least one article with a tag such as `Flowlu Test Tag` and content with a unique phrase such as `marigold import remedy`.
6. Import as `published`.
7. Observe whether the import succeeds for the KB admin, whether `Flowlu Test Tag` appears in `/kb/<kbSlug>/admin/tags`, and whether the imported article has the tag assigned.
8. Search the KB for `marigold import remedy` in full-text, semantic, and hybrid modes.
9. Call `POST /api/v1/rag/search` with an API key scoped to the KB and query `marigold import remedy`.
10. Observe that tag assignment and article embeddings are incomplete if the current gaps are present.

After implementation:

1. Repeat the same import as the KB admin.
2. Confirm preview, execute, SSE progress, job detail, and job list all work without global admin role.
3. Confirm imported Flowlu tags exist as KB-scoped tags and are linked to the imported articles.
4. Confirm full-text search returns the imported published article.
5. Confirm semantic and hybrid search return the imported published article without running a separate reindex command.
6. Confirm RAG search returns the imported article chunk for the scoped API key.
7. Import a ZIP with an attachment containing a unique phrase and confirm the attachment row moves from `pending` to `succeeded` or `unsupported` as appropriate.
8. Confirm import history shows the completed job, counts, status, and error count.
9. Log in as a KB editor or viewer without KB admin authority and confirm import endpoints return `403`.
10. Log in as a KB admin for a different KB and confirm they cannot inspect or operate on this KB's import jobs.

## Implementation Plan

### 1. Confirm Authorization Coverage

Audit all import and import-adjacent endpoints:

- `POST /api/knowledge-bases/:kbId/admin/import/preview`
- `POST /api/knowledge-bases/:kbId/admin/import/execute`
- `GET /api/knowledge-bases/:kbId/admin/import/:id/progress`
- `GET /api/knowledge-bases/:kbId/admin/import/:id`
- `GET /api/knowledge-bases/:kbId/admin/import`
- `POST /api/knowledge-bases/:kbId/admin/articles/bulk-publish`

Keep `authMiddleware`, `resolveKb`, and `requireKbAdmin` as the gate for KB-scoped import administration. Add or update tests proving:

- Global admin passes.
- KB admin passes for their KB.
- KB admin for another KB fails.
- KB editor fails.
- KB viewer fails.
- Missing or inaccessible KB remains `404`/`403` according to the established route pattern.

Use `apps/api/src/__tests__/routes/admin/import.test.ts` for import routes and `apps/api/src/__tests__/routes/admin/bulk-publish.test.ts` for bulk publish.

### 2. Preserve Flowlu Tags During Import

Update `apps/api/src/services/import/import-engine.ts` to import `tags` and `articleTags` from `@dovetail/db`.

Add a private helper such as `assignTags(articleId: string, tagNames: string[])`:

- Trim tag names and discard empty values.
- Deduplicate tags per article using a case-insensitive key.
- Normalize slugs with `toSlug()`.
- Look up existing tags scoped to `this.opts.knowledgeBaseId`.
- Reuse an existing tag when its lowercased name or slug matches.
- Insert missing tags with `{ name, slug, knowledgeBaseId }`.
- Handle unique conflicts by re-querying the KB-scoped tag rather than failing the article import.
- Insert `article_tags` rows and use conflict-tolerant behavior for duplicate article/tag pairs.

Call the helper after article creation and before the article is counted as imported. If tag assignment fails for one article, let the article-level error path decide whether the whole article should be marked failed. Prefer making tag assignment part of the article transaction if the import engine is refactored to wrap each article in a transaction.

### 3. Make Per-Article Import Atomic Enough

The current import flow inserts article rows, then attachments, and will soon add tags and embeddings. Tighten failure behavior so a partial article is not silently counted as successful when required metadata fails.

Recommended approach:

- Wrap article creation, tag creation/linking, and attachment row creation in a per-article transaction.
- Copy attachment files before inserting attachment rows, or clean up copied files if the transaction fails after copies.
- Keep attachment indexing enqueue calls outside the transaction but after commit.
- Keep article embedding generation outside the transaction but make its failure visible in job warnings/errors.

If a full transaction refactor is too large for this step, at minimum document and test which post-insert failures leave a successful imported article versus an article-level import error.

### 4. Trigger Article Embeddings For Imported Content

Call `generateEmbeddings(articleId)` from `apps/api/src/services/embedding-pipeline.ts` after each imported article is committed.

Behavior:

- Skip empty extracted article text as `generateEmbeddings()` already does.
- For published imports, embeddings must be available to semantic search and RAG immediately after the job completes.
- For draft imports, generating embeddings is acceptable, but user-facing search/RAG filters must continue to exclude drafts unless the route explicitly allows editor/admin draft visibility.
- Capture embedding failures in `importJobs.errorLog` or a warning-style metadata field so the job can complete with clear remediation information.

If embedding calls are too slow for large imports, add a bounded in-process queue similar to attachment indexing. The job should still wait for queued article embedding work when the product requirement says content is available without a separate manual step.

### 5. Confirm Attachment Indexing Is Complete For Imports

The import engine already inserts imported attachments with `extractionStatus: 'pending'` and calls `enqueueAttachmentIndexing(attachmentId)`.

Verify and test:

- Imported attachment files use the same `storagePath` convention as editor uploads.
- `resolveAttachmentPath()` can resolve imported attachment paths.
- Text/PDF/DOCX attachments created by import are extracted and indexed.
- Unsupported imported files become `unsupported` rather than staying `pending`.
- Attachment indexing failures do not break the article import unless file copying or row insertion failed.

Add focused coverage in `apps/api/src/__tests__/services/import-engine.test.ts` by mocking `enqueueAttachmentIndexing()` and asserting it is called for each inserted attachment.

### 6. Ensure Search And RAG See Imported Content

No new search endpoint should be needed if steps 5, 7, and 11 foundations are present. Validate the data path instead:

- Article import writes `plainText`, so full-text triggers can populate `articles.search_vector`.
- Article import generates `article_embeddings`.
- Attachment import enqueues extraction and writes `attachment_embeddings` when supported.
- Search service queries article and attachment sources through the parent article permission filters.
- RAG service queries article and attachment embeddings and scopes by API-key KB access.

Add tests that assert the import engine invokes the indexing seams rather than duplicating search-service tests:

- `generateEmbeddings(articleId)` is called for imported articles with content.
- `enqueueAttachmentIndexing(attachmentId)` is called for imported attachments.
- Duplicate article skips do not call indexing for the skipped article.

Then run existing focused search/RAG tests to confirm no contract regression:

```sh
pnpm --filter @dovetail/api test -- src/__tests__/routes/search.test.ts src/__tests__/routes/rag.test.ts
```

### 7. Add Import History UI

Use the existing `GET /api/knowledge-bases/:kbId/admin/import` endpoint from the KB import page.

Recommended UI shape:

- Keep `ImportWizard` as the primary action on `/kb/[kbSlug]/admin/import`.
- Add a compact import history section below the wizard, or add a sibling client component such as `ImportHistory`.
- Show status, imported/total articles, error count, created date, completed date, and selected default status.
- Provide a small detail expansion or link for the job `errorLog`.
- Refresh history after a job completes.

Data-fetching options:

- Server fetch recent jobs in `apps/web/app/(admin)/kb/[kbSlug]/admin/import/page.tsx` and pass them into a client component.
- Or let `ImportWizard` accept an `onComplete` callback and keep `ImportHistory` client-side with `apiClientFetch()`.

Prefer a separate `ImportHistory` component if the wizard is already large enough. Keep the UI dense and administrative rather than creating a marketing-style page.

### 8. Add API And Service Tests

Add or update route tests in `apps/api/src/__tests__/routes/admin/import.test.ts`:

- KB admin can preview without global admin role.
- KB admin can execute an import for their KB.
- KB editor cannot preview or execute.
- Import job list is scoped to the current KB.
- Import job detail and progress cannot read jobs from another KB.

Add or update service tests in `apps/api/src/__tests__/services/import-engine.test.ts`:

- Flowlu tag names create KB-scoped tags.
- Existing KB-scoped tags are reused.
- Same tag name in another KB is not reused.
- Article/tag links are inserted.
- Duplicate Flowlu tags do not create duplicate rows or duplicate article links.
- Imported article content triggers `generateEmbeddings()`.
- Imported attachments trigger `enqueueAttachmentIndexing()`.
- Duplicate article skips do not create tags, article-tag links, embeddings, or attachment indexing work for the skipped article.

Keep parser tests in `apps/api/src/__tests__/services/flowlu-parser.test.ts` focused on preserving the raw `tags` array from `data.json`.

### 9. Add A Focused Integration Smoke

After unit tests pass, use the local workflow:

```sh
just db-reset
just dev
```

Manual smoke:

1. Log in as `Local Admin`.
2. Assign a non-global user KB admin access to a test KB.
3. Log in as that user.
4. Import a small Flowlu ZIP as `published`.
5. Confirm import history shows completion.
6. Confirm imported tags appear in KB tag admin.
7. Confirm the imported article is returned by KB search.
8. Confirm semantic search or RAG returns the article if the local embedding provider is configured.
9. Confirm a forbidden user cannot open import endpoints.

Use `just smoke` after the targeted tests if the changes touch route mounting, auth, or shared search behavior.

## Validation Commands

Run the smallest relevant checks first:

```sh
pnpm --filter @dovetail/api test -- src/__tests__/routes/admin/import.test.ts
pnpm --filter @dovetail/api test -- src/__tests__/routes/admin/bulk-publish.test.ts
pnpm --filter @dovetail/api test -- src/__tests__/services/flowlu-parser.test.ts
pnpm --filter @dovetail/api test -- src/__tests__/services/import-engine.test.ts
pnpm --filter @dovetail/api test -- src/__tests__/services/import-integration.test.ts
```

Then run the search/RAG regression checks affected by indexing:

```sh
pnpm --filter @dovetail/api test -- src/__tests__/routes/search.test.ts src/__tests__/routes/rag.test.ts
```

If web history UI is added:

```sh
pnpm --filter @dovetail/web test
```

Finish with:

```sh
pnpm --filter @dovetail/api build
pnpm --filter @dovetail/web build
```

## Risks And Decisions

- Large Flowlu imports can make synchronous article embedding generation slow. Decide whether job completion waits for embeddings or whether the job has an explicit indexing phase before completion.
- Import currently uses an in-memory temp session and in-process background job. This is acceptable for local/first-pass behavior but will not survive API restarts.
- Tag normalization needs a deterministic conflict policy for names that slug to the same value, such as `Legal Aid` and `Legal-Aid`.
- Attachment indexing is asynchronous. If product semantics require attachments to be searchable at job completion, the import job needs to await attachment indexing too; otherwise the UI should show attachment indexing as pending after import completion.
- Partial failures should be visible but should not hide successfully imported articles. The job history UI should make that distinction clear.

## Definition Of Done

- KB admins, not only global admins, can run imports for their KB.
- Editors/viewers and KB admins for other KBs cannot run or inspect imports.
- Flowlu tags are imported into KB-scoped tags and linked to imported articles.
- Imported article content is embedded during import and appears in semantic search/RAG without a manual reindex.
- Imported attachments are queued for extraction/indexing and have visible final extraction state.
- KB import page shows import history.
- Targeted route/service tests and search/RAG regression tests pass.
