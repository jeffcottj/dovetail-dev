# Step 8 Implementation Plan: Word Document Conversion

## Purpose

This plan covers step 8 from `docs/product-gap-analysis.md`:

> Add DOCX conversion.

The goal is to let editors upload a Microsoft Word `.docx` file while creating or updating an article, convert it into the app's editable TipTap rich text JSON, review or revise the converted content before publishing, and optionally retain the original Word file as an article attachment.

## Current Behavior

Relevant current behavior in this branch:

- There is no editor-facing `.docx` conversion workflow.
- `apps/api/package.json` already includes `mammoth`, currently used by attachment text indexing for raw text extraction only.
- Attachment upload, replacement, download, and indexing exist under `apps/api/src/routes/attachments.ts`.
- `apps/api/src/services/attachment-indexing.ts` extracts DOCX plain text for search/RAG, but does not preserve document structure or produce article content.
- `apps/api/src/services/import/html-to-tiptap.ts` converts HTML into TipTap-compatible JSON for Flowlu imports.
- The current HTML-to-TipTap schema supports common document nodes and tables, but should be reviewed against the editor extensions before DOCX conversion depends on it.
- `ArticleEditor` includes table extensions, but `ArticleCreateForm` does not yet include the same table extensions.
- `ArticleCreateForm` saves new articles through `POST /api/knowledge-bases/:kbId/articles`.
- `ArticleEditor` saves existing articles through `PATCH /api/knowledge-bases/:kbId/articles/:id`.
- `AttachmentManager` can upload the original file only after an article exists.

Primary files to inspect before implementation:

- `apps/api/src/routes/articles.ts`
- `apps/api/src/routes/attachments.ts`
- `apps/api/src/services/import/html-to-tiptap.ts`
- `apps/api/src/services/attachment-indexing.ts`
- `apps/api/src/utils/tiptap.ts`
- `apps/api/src/app.ts`
- `apps/api/src/__tests__/services/html-to-tiptap.test.ts`
- `apps/api/src/__tests__/routes/articles.test.ts`
- `apps/web/components/ArticleCreateForm.tsx`
- `apps/web/components/ArticleEditor.tsx`
- `apps/web/components/EditorToolbar.tsx`
- `apps/web/components/AttachmentManager.tsx`
- `packages/types/src/index.ts`

## Product Semantics To Implement

- Editors can upload a `.docx` from the create article page before an article exists.
- Editors can upload a `.docx` from the edit page for an existing article.
- Conversion requires article edit permission in the target scope:
  - create flow: editor access to the selected category.
  - edit flow: edit access to the existing article.
- The converted result replaces or inserts into the editor as editable rich text, but does not publish automatically.
- The server converts supported Word structures into the app's rich text schema:
  - headings.
  - paragraphs.
  - bullet and ordered lists.
  - tables.
  - links.
  - images where technically practical.
  - bold, italic, underline, strikethrough, code, superscript/subscript where supported by the editor schema.
- Unsupported or ambiguous formatting should be dropped or simplified with warnings rather than failing the entire conversion.
- The original `.docx` can be retained as an article attachment when the editor selects that option.
- Server-side validation must reject non-DOCX files, oversized files, missing target scope, and unauthorized conversion attempts.
- Conversion errors should be visible to the editor but should not log document contents.

## Reproduction Recipe

Before implementation:

1. Run `just dev`.
2. Log in at `/login` as `Local Editor` or `Local Admin`.
3. Open `/kb/<kbSlug>/articles/new`.
4. Observe there is no control to upload a `.docx` and populate the editor.
5. Create a draft article, open it in edit mode, and observe there is still no `.docx` conversion control.
6. Upload a `.docx` as an attachment and confirm it remains only an attachment; it does not populate article rich text.

After implementation:

1. Create a representative `.docx` with a title, headings, paragraphs, bold/italic text, links, ordered and unordered lists, a table, and an image.
2. Run `just dev` and log in as `Local Editor`.
3. Open `/kb/<kbSlug>/articles/new`, select a category where the user can edit, and upload the `.docx`.
4. Confirm the editor is populated with equivalent editable rich text before saving.
5. Save as draft and confirm the article view renders the converted content.
6. Repeat from an existing article edit page and confirm conversion can replace the current editor content only after explicit editor action.
7. Select the option to retain the original `.docx`, save the article, and confirm the Word file appears in the attachment list.
8. Try the same conversion as a viewer or for an inaccessible category/article and confirm the API returns `403` or `404` without converting.
9. Upload a non-DOCX file and an oversized DOCX and confirm clear validation errors.

## Implementation Plan

### 1. Normalize The Editor Schema Used By Create, Edit, And Conversion

Make the create and edit editor extension sets agree before adding DOCX conversion:

- Extract a shared client-side extension builder, for example `apps/web/lib/editor/extensions.ts`.
- Include the common extensions currently used by edit:
  - `StarterKit`
  - `Image`
  - `Link`
  - `Table`
  - `TableRow`
  - `TableCell`
  - `TableHeader`
- Use the shared builder from both `ArticleCreateForm` and `ArticleEditor`.

Review `apps/api/src/services/import/html-to-tiptap.ts` so its ProseMirror schema can produce every node the client editor accepts for DOCX conversion. At minimum, confirm or add:

- `image` node with `src`, `alt`, and `title` attrs.
- table cell content compatible with TipTap table extensions.
- underline and strikethrough marks if Mammoth emits those styles.
- safe link attributes.

Keep broader editor features such as callouts and citation blocks for step 9 unless they are needed to faithfully preserve the representative DOCX fixtures.

### 2. Add A DOCX Conversion Service

Create a focused API service, for example `apps/api/src/services/docx-conversion.ts`.

Responsibilities:

- Accept a trusted uploaded temp file or buffer plus original filename.
- Validate the file as DOCX by extension, MIME type, and ZIP/package signature where practical.
- Enforce a configurable size limit such as `DOCX_CONVERT_MAX_BYTES`, defaulting to a conservative value like `25MB`.
- Use `mammoth.convertToHtml()` rather than `extractRawText()` so headings, lists, links, tables, images, and inline formatting can survive conversion.
- Convert the generated HTML to TipTap JSON through the existing `htmlToTiptap()` pipeline.
- Return a structured result:

```ts
interface DocxConversionResult {
  content: Record<string, unknown>;
  plainText: string;
  suggestedTitle?: string;
  warnings: string[];
}
```

Use Mammoth messages as warnings, but sanitize them before sending to clients. Do not include document contents or full stack traces in warnings.

### 3. Decide How To Handle Images

Implement image handling deliberately instead of relying on Mammoth defaults.

Recommended first pass:

- Convert embedded images to uploaded article assets only if the app already has or adds a durable article-image storage path.
- If durable image asset handling is too large for step 8, skip embedded images with a warning and keep the rest of the document conversion successful.

If image preservation is included in step 8:

- Store converted images under `getUploadsDir()/article-images` or an equivalent predictable path.
- Add a small image-serving route that enforces article read permission, or store images as attachments and reference their authorized download URL.
- Add image nodes to the converted TipTap JSON with safe URLs.
- Avoid base64 image data in article JSON because it bloats rows and complicates rendering, search, and backups.

This choice should be made before backend implementation because it affects the conversion service interface and tests.

### 4. Add Authenticated Conversion Routes

Add routes under the KB-scoped API surface, for example:

```txt
POST /api/knowledge-bases/:kbId/document-conversions/docx
```

Use `multipart/form-data` with:

- `file`: the `.docx` file.
- `categoryId`: required for create-flow conversion.
- `articleId`: optional alternative for edit-flow conversion.

Route behavior:

- Run `authMiddleware`, `resolveKb`, and visible-KB middleware consistently with other KB-scoped routes.
- Require exactly one target scope:
  - `categoryId` for a new article conversion.
  - `articleId` for an existing article conversion.
- For `categoryId`, verify the category belongs to `:kbId` and the user has editor access there.
- For `articleId`, verify the article belongs to `:kbId` and the user can edit it.
- Use `multer` with an explicit DOCX conversion size limit and a temp directory under `getUploadsDir()/docx-temp`.
- Clean up temp files on success and failure.
- Return `400` for missing file, invalid file type, invalid target scope, and parser validation failures.
- Return `403` for readable but non-editable targets.
- Return `404` for missing or cross-KB targets.

Keep conversion separate from article create/update routes. The article remains unchanged until the editor saves or publishes through the existing article endpoints.

### 5. Add Shared Client Component For DOCX Import

Create a small client component, for example `apps/web/components/DocxImportControl.tsx`.

Responsibilities:

- Accept `.docx` only.
- Send `FormData` directly with credentials, similar to `AttachmentManager`.
- Pass either `categoryId` or `articleId` depending on create versus edit flow.
- Show conversion progress and API errors through `useToast()`.
- Expose converted TipTap JSON to the parent through `onConverted(content, metadata)`.
- Show warnings in a compact dismissible area or toast summary.
- Include an option such as `Keep original Word document as attachment` when retention is possible.

Avoid putting instructional text into the editor surface. The control should be a concise document-import action near the editor toolbar or article actions.

### 6. Wire Create-Flow Conversion

Update `ArticleCreateForm`:

- Add the DOCX import control after the category selector and before the editor.
- Disable conversion until a category is selected, because the backend needs the target category to authorize editor access.
- On successful conversion, replace the editor document with the returned TipTap JSON.
- If `suggestedTitle` is present and the title field is empty, populate the title.
- Track the original DOCX `File` only when the editor selects retention.
- On save or publish:
  - create the article through the existing JSON body.
  - assign tags as today.
  - if retention is selected, upload the original DOCX to the new article's attachment endpoint.
  - then publish if the user chose publish.
- If attachment retention fails after article creation, keep the article and show a clear warning that the original Word file was not attached.

Do not stage unsaved attachments before the draft exists. That would add orphan cleanup and draft lifecycle complexity.

### 7. Wire Edit-Flow Conversion

Update `ArticleEditor`:

- Add the DOCX import control near the toolbar.
- Use `article.id` as the conversion target.
- Require an explicit confirmation before replacing non-empty editor content with converted content.
- On successful conversion, replace the editor content but do not save automatically.
- If retention is selected, upload the original DOCX through the existing attachment endpoint after conversion succeeds. This can happen immediately because the article already exists.
- If immediate retention upload succeeds, the existing `AttachmentManager` should refresh or expose a callback so the new attachment appears without a full page reload.

Keep the save and publish buttons responsible for persisting article content, matching the current edit workflow.

### 8. Preserve Search And Version Semantics

Because converted DOCX content flows through existing article create/update endpoints:

- `plainText` should continue to be computed by `extractText(content)`.
- full-text article search should update through the existing `articles.search_vector` trigger.
- article embeddings should be generated through the existing `generateEmbeddings()` calls.
- `lastEditedById` should be populated by the existing create/update handlers.
- version history should capture the pre-conversion article state when the editor saves converted content.

Add tests only if any of these assumptions are broken by the conversion implementation.

### 9. Add Focused Backend Tests

Add service tests for `docx-conversion`:

- Converts headings, paragraphs, links, bold/italic text, bullet lists, ordered lists, and tables into valid TipTap JSON.
- Returns an empty but valid document for an empty or nearly empty DOCX.
- Reports sanitized warnings for unsupported formatting.
- Rejects invalid DOCX input without leaking parser internals.

Add route tests:

- Create-scope conversion succeeds for an editor with access to the category.
- Edit-scope conversion succeeds for an editor with access to the article.
- Viewer conversion is rejected.
- Cross-KB category/article targets return `404`.
- Missing file, wrong extension/MIME type, and oversized file return `400`.
- Temp upload files are cleaned up after success and failure if the test harness can verify this cheaply.

Use small generated DOCX fixtures where possible. If generating DOCX files in tests is too heavy, keep compact binary fixtures under an API test fixtures directory and document how they were created.

### 10. Add Focused Web Tests

Add component tests where the existing web test harness makes them cheap:

- Create form disables DOCX conversion until a category is selected.
- Successful conversion calls `editor.commands.setContent()` or equivalent and populates an empty title when a suggested title exists.
- Save after create uploads retained original DOCX only after the article is created.
- Edit form asks before replacing existing content.
- Conversion API failures surface a toast and do not alter editor content.

Do not attempt end-to-end browser automation unless the component tests cannot cover the interaction boundary.

### 11. Validation Commands

Run the smallest relevant checks after implementation:

```sh
pnpm --filter @dovetail/api test -- docx-conversion
pnpm --filter @dovetail/api test -- articles.test.ts
pnpm --filter @dovetail/api test -- attachments.test.ts
pnpm --filter @dovetail/web test -- ArticleCreateForm
pnpm --filter @dovetail/web test -- ArticleEditor
pnpm --filter @dovetail/api build
pnpm --filter @dovetail/web build
```

Then rerun the reproduction recipe through the local app with `just dev`.

## Rollout Notes

- Treat Word document contents as sensitive legal material. Do not log converted text, generated HTML, or uploaded filenames beyond normal metadata needed for diagnostics.
- Keep conversion synchronous for the first pass because it is editor-initiated and returns editable content, but enforce size limits and timeouts so the API cannot be tied up by large documents.
- Reuse the existing attachment upload route for original DOCX retention so retained files automatically participate in attachment indexing from step 7.
- Conversion should not require external services.
- If image preservation is deferred, make the warning explicit enough that editors understand text conversion succeeded while embedded images were omitted.

## Out Of Scope For Step 8

- OCR for scanned Word-embedded images.
- `.doc` legacy binary Word files.
- Bulk DOCX import.
- A background worker service for conversion.
- New callout or citation-specific editor nodes; those belong to step 9 unless already supported before this work starts.
- Changing attachment indexing semantics beyond reusing the existing attachment upload flow for retained originals.
