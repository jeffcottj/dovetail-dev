# Step 6 Implementation Plan: Attachment Management, Delivery, And Permissions

## Purpose

This plan covers step 6 from `docs/product-gap-analysis.md`:

> Mount and secure attachment routes, then add attachment management.

The goal is to make article attachments a complete product feature before step 7 adds attachment text extraction and indexing. Users with article read access should be able to see and download attachments. Users with article edit access should be able to upload, replace, and delete attachments. Attachment files must live in predictable persistent storage and all attachment routes must enforce the same KB/category authorization rules as articles.

## Current Behavior

Relevant current behavior in this branch:

- `packages/db/src/schema.ts` defines `attachments` with `articleId`, `filename`, `storagePath`, `mimeType`, `sizeBytes`, and `createdAt`.
- Flowlu import copies imported files into `getUploadsDir()/attachments` and inserts attachment rows.
- `apps/api/src/utils/storage.ts` supports `UPLOADS_DIR`, but `docker-compose.yml` does not mount a persistent upload volume for the API service.
- `apps/api/src/app.ts` already mounts:
  - `GET /api/knowledge-bases/:kbId/articles/:id/attachments`
  - `GET /api/attachments/:id/download`
- `apps/api/src/routes/attachments.ts` checks `canReadArticle()` before listing or downloading current attachments.
- Download still resolves `attachment.storagePath` relative to `process.cwd()`, which is inconsistent with `getUploadsDir()` and can break when `UPLOADS_DIR` is configured.
- `AttachmentList` exists in `apps/web/components/AttachmentList.tsx`, but article view pages do not render it.
- There is no editor API or UI for uploading, replacing, deleting, or attaching files to articles outside import.
- Shared types do not export an `Attachment` interface.

Primary files to inspect:

- `packages/db/src/schema.ts`
- `packages/types/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/attachments.ts`
- `apps/api/src/routes/articles.ts`
- `apps/api/src/services/permissions.ts`
- `apps/api/src/utils/storage.ts`
- `apps/api/src/services/import/import-engine.ts`
- `apps/api/src/__tests__/routes/attachments.test.ts`
- `apps/web/components/AttachmentList.tsx`
- `apps/web/components/ArticleEditor.tsx`
- `apps/web/components/ArticleCreateForm.tsx`
- `apps/web/app/(main)/kb/[kbSlug]/articles/[...slugPath]/page.tsx`
- `apps/web/lib/api-client.ts`
- `docker-compose.yml`

## Product Semantics To Implement

- Published article attachments are visible and downloadable to users who can read the article.
- Draft and archived article attachments are visible and downloadable only to users with edit/admin access in that article's permission scope.
- Attachment management operations require article edit access.
- KB URL scope is authoritative: a request under `/api/knowledge-bases/:kbId/...` must return `404` when the article or attachment belongs to another KB.
- Direct attachment download URLs must not leak inaccessible attachment existence. Prefer `404` for missing, cross-KB, or unreadable attachments.
- Attachment upload stores the original display filename, trusted MIME type, byte size, and an internal storage path based on the generated attachment ID.
- Replacement creates a new file for an existing attachment row, removes the old file after the DB update succeeds, and preserves permission checks.
- Deletion removes the DB row and then best-effort removes the stored file. Orphan cleanup can be handled later, but the normal path should not leave files behind.
- Attachment changes should mark the parent article as changed enough for step 7 to re-index attachments. In this step, use a minimal hook such as updating `articles.updatedAt` and documenting the later extraction/indexing hook.

## Reproduction Recipe

Before implementation:

1. Run `just dev`.
2. Log in at `/login` as `Local Admin` or `Local Editor`.
3. Open a KB article that has imported attachments, or seed/import one through the Flowlu import path.
4. Observe attachments do not appear on the article view page because `AttachmentList` is not wired in.
5. Open the article edit page.
6. Observe there is no control to upload, replace, or delete attachments.
7. Set `UPLOADS_DIR` to a non-default path and import an attachment.
8. Request `GET /api/attachments/:id/download`.
9. Observe download can fail because the route resolves `storagePath` from `process.cwd()` instead of `getUploadsDir()`.

After implementation:

1. Log in as a user with read access to a published article.
2. Open the article view and confirm the attachment list renders.
3. Download an attachment and confirm the response has the correct content type, disposition filename, and file bytes.
4. Log in as a user without read access to the same KB/article.
5. Request the list and download routes and confirm they return `404`.
6. Log in as a user with editor access to the article.
7. Upload a file from the edit page and confirm it appears on the article view.
8. Replace that attachment and confirm the row keeps its ID while metadata and file bytes change.
9. Delete the attachment and confirm it disappears from the UI and download returns `404`.
10. Confirm the same upload/replace/delete requests return `403` for a viewer who can read but cannot edit.
11. Repeat the download with `UPLOADS_DIR` configured to a non-default directory.

## Implementation Plan

### 1. Normalize Attachment Types And API Shape

Add an `Attachment` interface to `packages/types/src/index.ts`:

```ts
export interface Attachment {
  id: string;
  articleId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date | string;
}
```

Use this shape consistently in `AttachmentList`, editor attachment components, and API tests. Do not expose `storagePath` to clients.

Keep the existing list route response shape unless a UI need requires additional fields.

### 2. Harden Backend Storage Path Handling

Update `apps/api/src/routes/attachments.ts` to resolve files through `getUploadsDir()` instead of `process.cwd()`.

Recommended helper:

```ts
function resolveAttachmentPath(storagePath: string) {
  const relativePath = storagePath.startsWith('uploads/')
    ? storagePath.slice('uploads/'.length)
    : storagePath;
  const absolutePath = path.resolve(getUploadsDir(), relativePath);
  const uploadsRoot = path.resolve(getUploadsDir());

  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Invalid attachment storage path');
  }

  return absolutePath;
}
```

Preserve compatibility with imported rows that currently store paths like `uploads/attachments/<id>.ext`. New uploads should use the same relative storage convention unless a migration deliberately changes it.

Use a content disposition helper that safely quotes filenames, or switch to `res.download()`/`content-disposition` if the dependency is already available. Avoid trusting user-supplied filenames in headers without escaping.

### 3. Add Shared Attachment Authorization Helpers

Refactor the route-local `requireAttachmentArticleReader()` into two focused helpers in `attachments.ts` or a small service:

- `loadAttachmentArticleForRead(req, res, articleId, kbId?)`
- `loadAttachmentArticleForEdit(req, res, articleId, kbId?)`

The read helper should call `canReadArticle()`.

The edit helper should call `canEditArticle()` and should return `403` for an existing article that the user can read but cannot edit. Use `404` for missing or cross-KB articles.

For direct download routes, load the attachment, join or look up its parent article/category, and apply the read helper. Consider adding a KB-scoped download route:

```txt
GET /api/knowledge-bases/:kbId/articles/:id/attachments/:attachmentId/download
```

Keep `GET /api/attachments/:id/download` as a compatibility shortcut only if it applies the same permission checks and does not reveal inaccessible rows.

### 4. Implement Upload, Replace, And Delete Routes

Use `multer` because it is already present in `@dovetail/api`.

Add routes under `articleAttachmentsRouter`:

```txt
POST   /api/knowledge-bases/:kbId/articles/:id/attachments
PATCH  /api/knowledge-bases/:kbId/articles/:id/attachments/:attachmentId
DELETE /api/knowledge-bases/:kbId/articles/:id/attachments/:attachmentId
```

Recommended behavior:

- `POST` accepts `multipart/form-data` with field name `file`.
- `PATCH` accepts the same field and replaces the file and metadata for an existing attachment on the article.
- `DELETE` removes one attachment from the article.
- All three require edit access through the edit helper.
- All three verify `attachment.articleId === req.params.id` for replace/delete.
- All three return `404` when the attachment belongs to another article or KB.
- Upload limits should be explicit. Start with a conservative env-configurable size, for example `ATTACHMENT_MAX_BYTES` defaulting to `25MB`.
- MIME type should come from `file.mimetype` with a fallback to `mime.lookup(file.originalname)` and finally `application/octet-stream`.
- Store files in `getUploadsDir()/attachments/<attachmentId><safeExtension>`.
- Store `storagePath` as `uploads/attachments/<attachmentId><safeExtension>` for compatibility with imported attachments.
- Use `ensureDir()` before moving/copying files.
- Clean up Multer temp files on validation and authorization failures.
- Update parent article `updatedAt` after successful upload, replace, and delete.

Do not implement text extraction or embeddings in this step. Leave a small internal function boundary, for example `markAttachmentIndexingPending(articleId)`, as a no-op or TODO only if it makes step 7 easier.

### 5. Wire Attachments Into Article View

Update `apps/web/app/(main)/kb/[kbSlug]/articles/[...slugPath]/page.tsx` to render:

```tsx
<AttachmentList articleId={article.id} />
```

Place it after `<ArticleContent />` so attachments read as supporting material for the article.

Update `AttachmentList`:

- Import the shared `Attachment` type.
- Remove the fallback `/api/articles/:id/attachments` path because the app now operates in KB scope.
- Use a KB-scoped download URL when that route exists.
- Keep the empty state hidden on article view pages.
- Surface a small error state only in editor/manage mode; regular readers should not see noisy attachment fetch failures.

### 6. Add Editor Attachment Management UI

Create a focused client component, for example `apps/web/components/AttachmentManager.tsx`.

Responsibilities:

- Fetch the same KB-scoped attachment list as `AttachmentList`.
- Show filename, type, size, and created date.
- Provide upload, replace, delete, and download controls.
- Use `FormData` directly instead of `apiClientFetch()` because `apiClientFetch()` currently forces `Content-Type: application/json` whenever a body exists.
- Confirm destructive deletes with the existing modal pattern if available, or a simple `window.confirm()` if the local UI pattern is not established.
- Show toast success/failure using `useToast()`.
- Disable controls while an operation is in progress.
- Refresh local list after each operation.

Wire it into `ArticleEditor` below the tag picker or below the editor body. Keep it clearly associated with the article being edited rather than the rich-text document content.

For create flow, keep scope narrow:

- Either defer attachment upload until after the draft exists and explain it through UI state, or
- Change create actions to create the draft first and then route to edit where attachments can be managed.

Do not attempt unsaved attachment staging in the first pass unless product requirements demand it. That adds orphan cleanup and draft lifecycle complexity.

### 7. Configure Persistent Upload Storage

Update `docker-compose.yml` so the API service has a persistent uploads volume:

```yaml
api:
  environment:
    UPLOADS_DIR: /data/uploads
  volumes:
    - uploads_data:/data/uploads

volumes:
  postgres_data:
  uploads_data:
```

Keep local hybrid development compatible with the existing default `./uploads` path when `UPLOADS_DIR` is not set.

Add a short note to the relevant docs if deployment/backup docs already mention uploads. Full backup/restore documentation belongs to step 12, but step 6 should make the runtime storage location predictable.

### 8. Add Route Tests

Create `apps/api/src/__tests__/routes/attachments.test.ts`.

Cover:

- `GET /api/knowledge-bases/:kbId/articles/:id/attachments` returns rows for a reader.
- List route returns `404` for cross-KB article access.
- Download returns file bytes for a reader.
- Download returns `404` for missing, orphaned, cross-KB, and unreadable attachments.
- `POST` creates an attachment for an editor and rejects a viewer with `403`.
- `PATCH` replaces an attachment for an editor and rejects wrong-article attachments with `404`.
- `DELETE` deletes an attachment for an editor and rejects a viewer with `403`.
- `UPLOADS_DIR` path resolution works for imported-style `uploads/attachments/...` paths.

Mock `fs` cautiously where possible, but include at least one temp-directory test for path resolution and download bytes. Use `process.env.UPLOADS_DIR` scoped to the test and restore it afterward.

### 9. Add UI Tests Where They Are Cheap

Add focused tests for attachment UI behavior rather than full browser coverage:

- `AttachmentList` renders fetched attachments and builds KB-scoped download URLs.
- `AttachmentList` renders nothing for an empty list.
- `AttachmentManager` uploads with `FormData`, refreshes after success, and calls delete/replace endpoints.

If the current test harness makes file input awkward, prioritize route tests and one render test for `AttachmentList`.

### 10. Validation Commands

Run the smallest checks after implementation:

```sh
pnpm --filter @dovetail/api test -- attachments.test.ts
pnpm --filter @dovetail/web test -- AttachmentList
pnpm --filter @dovetail/web test -- AttachmentManager
pnpm --filter @dovetail/api build
pnpm --filter @dovetail/web build
```

Then rerun the reproduction recipe through the local app. If the app is already running through `just dev`, use the existing process. Otherwise start it with:

```sh
just dev
```

## Out Of Scope For Step 6

- Extracting text from PDFs, DOCX files, or plain text attachments.
- Adding attachment rows to full-text search, semantic search, RAG, or MCP responses.
- DOCX-to-rich-text article conversion.
- Full production backup and restore procedures for uploads.
- Rich text image asset management beyond ordinary article attachments.

Those belong to later implementation-order steps and should be kept out of this change unless they are needed to make attachment CRUD safe.
