# Dovetail PRD Gap Analysis

This document compares the current repository state with `docs/product-requirements.md` and lists the product features required to bring the app up to the target specification.

## Current Baseline

The repo already has a strong foundation:

- pnpm TypeScript monorepo with `apps/web`, `apps/api`, `packages/db`, and `packages/types`.
- Next.js web app, Express API, Drizzle/PostgreSQL schema, and Docker Compose services for `web`, `api`, and `postgres`.
- Entra ID support through Auth.js, with Google still present as an alternate provider.
- Multiple knowledge bases, nested categories, tags, article versions, article statuses, KB roles, category roles, API keys, import jobs, attachments, and pgvector article embeddings in the data model.
- Article create/edit/publish/archive flows.
- KB-scoped full-text, semantic, and hybrid search.
- RAG REST endpoint with KB-scoped API keys.
- Global and KB admin UI shells.
- Flowlu ZIP import with preview, background execution, SSE progress, article/category creation, and attachment record creation.

The largest gaps are authorization completeness, KB visibility semantics, multi-KB search, attachment indexing, Word document conversion, MCP support, and production deployment/backup completeness.

## Required Features

### 1. Knowledge Base Visibility And Default Access

Current state:

- `knowledge_bases` has no default access policy field.
- `GET /api/knowledge-bases` returns every KB to every authenticated user.
- Current global `viewer` fallback effectively makes private KB semantics impossible unless role resolution is changed.

Required features:

- Add a KB access policy field, for example `defaultAccess: 'org_viewer' | 'private'`.
- Update KB creation so global admins choose org-visible or private.
- Update KB editing so global admins and KB admins can change this policy after creation.
- Update permission resolution so private KBs are hidden unless the user has an explicit KB/category role or global admin authority.
- Decide and codify global role semantics so a default global `viewer` does not unintentionally grant access to every private KB.
- Filter KB lists, workspace sidebars, KB switchers, admin context switchers, and search scope selectors to only KBs visible to the current user.
- Add tests for org-visible KBs, private KBs, explicit KB roles, category-only access, and global admin bypass.

### 2. Complete API Permission Enforcement

Current state:

- Editing routes perform some effective-role checks.
- Many read/list routes rely only on authentication and do not enforce effective KB/category permissions.
- Viewer-facing article routes can expose draft/archived content because status filtering is not consistently tied to role.
- Category, tag, version, import, bulk publish, and attachment routes do not consistently use KB-admin or effective-role checks.

Required features:

- Build shared authorization helpers for:
  - KB visibility.
  - KB admin authority.
  - article read permission.
  - article edit permission.
  - category manage permission.
  - maintenance/search permission filters.
- Apply those helpers across articles, categories, tags, versions, attachments, workspace activity, workspace search, KB overview, import, bulk publish, and admin endpoints.
- Ensure standard viewer-facing APIs only return published articles.
- Ensure drafts and archived articles are visible only to users with edit/admin access in the relevant scope.
- Replace global-role-only gates in KB-scoped admin routes with KB-aware gates where the PRD says KB admins are sufficient.
- Add route tests for unauthorized KB reads, draft leakage, category role inheritance, KB admin access, and private KB visibility.

### 3. Last Edited Metadata

Current state:

- `articles` stores `authorId`, `createdAt`, `updatedAt`, and `publishedAt`.
- `article_versions.authorId` captures snapshot authorship, but there is no canonical `lastEditedBy`.

Required features:

- Add `lastEditedById` or equivalent to `articles`.
- Populate it on create, edit, restore, import, bulk publish where relevant, and any future document conversion flow.
- Return last edited user metadata from article, search, stale-content, RAG, and MCP APIs.
- Show last edited date and last edited by in article headers and maintenance views.
- Backfill existing rows, likely from `authorId` or latest article version.

### 4. Multi-KB Search And Search-All

Current state:

- KB search supports full-text, semantic, and hybrid modes for one KB.
- Workspace search exists but is full-text only, does not expose multi-KB selection, and does not enforce per-user KB visibility.
- Search result snippets/highlights are limited; attachment matches are absent.

Required features:

- Add a search API that accepts one KB, selected KB IDs, or all accessible KBs.
- Enforce visible KB scope for every search.
- Support full-text, semantic, and hybrid modes across multiple KBs.
- Support filters required by the PRD:
  - KB.
  - category.
  - tag.
  - last updated date.
  - only articles I can edit.
- Return snippets/highlights for article body matches.
- Include KB name, category path, last edited date, and last edited by in results.
- Add UI for choosing one, many, or all accessible KBs.
- Add tests for multi-KB ranking, inaccessible KB exclusion, and filter combinations.

### 5. Stale Content Discovery

Current state:

- There are recent article lists and admin overview metrics, but no dedicated stale-content maintenance view.

Required features:

- Add an editor/admin maintenance view for stale content.
- Support filters:
  - KB.
  - category.
  - last updated before date.
  - date created fallback when never meaningfully updated.
  - only articles I can edit.
- Sort by oldest unchanged content.
- Include last edited date, last edited by, status, KB, and category path.
- Ensure results only include articles in the user's edit/admin permission domain.

### 6. Attachment Management, Delivery, And Permissions

Current state:

- Attachment schema and import creation exist.
- Attachment route code exists, but it is not mounted in `apps/api/src/app.ts`.
- Attachment routes only check authentication, not article/KB permission.
- The `AttachmentList` component exists but does not appear wired into article pages.
- There is no general editor upload/manage attachment flow outside import.

Required features:

- Mount attachment list/download routes under KB-scoped API paths.
- Add permission checks before listing or serving attachment files.
- Wire attachment display into article view pages.
- Add editor UI and API for uploading, replacing, deleting, and attaching files to articles.
- Store uploaded files in a predictable production volume.
- Ensure attachment operations update article indexing/embedding state as needed.
- Add route and UI tests for permitted and forbidden attachment access.

### 7. Attachment Text Extraction And Indexing

Current state:

- Search vectors and embeddings are based on article rich text/plain text.
- Imported attachments are stored but not text-extracted, full-text indexed, embedded, or returned as search/RAG matches.

Required features:

- Add an attachment text extraction pipeline for supported file types, at minimum PDF, DOCX, and plain text if feasible.
- Store extracted attachment text and extraction status.
- Add attachment-derived rows to full-text search.
- Add attachment-derived chunks to semantic search/RAG retrieval.
- Return search results that identify whether a match came from article body or attachment content.
- Include parent article metadata and attachment filename in search and AI responses.
- Re-extract and re-index when attachments change.

### 8. Word Document Conversion

Current state:

- There is no `.docx` upload/conversion path.
- No DOCX conversion dependency is present.

Required features:

- Add editor workflow to upload a `.docx` when creating or updating an article.
- Convert DOCX headings, paragraphs, lists, tables, links, images, and inline formatting into the app's rich text format.
- Preserve converted content as editable rich text before publishing.
- Optionally retain the original `.docx` as an article attachment.
- Add server-side validation, file size limits, error reporting, and tests for representative Word documents.

### 9. Rich Text Editor Enhancements

Current state:

- Tiptap-based rich text editing exists.
- Existing support includes common basics, links, images, and some table support.
- Create and edit editor extension sets are not identical.
- Callout/warning blocks and citation-specific blocks are not implemented as first-class authoring tools.

Required features:

- Normalize editor capabilities between create and edit flows.
- Add callout or warning blocks.
- Add citation-oriented blocks or structured citation formatting.
- Add robust image upload/management if images are intended to be article assets rather than remote links only.
- Ensure imported Flowlu content and DOCX content map cleanly into the same rich text schema.
- Add editor tests for create/edit parity and serialization.

### 10. MCP Server

Current state:

- No MCP app/package/service exists.
- LibreChat documentation covers direct RAG REST integration, not MCP.

Required features:

- Add a dedicated MCP server package or app.
- Expose it as a separate Docker Compose service.
- Authenticate the MCP server to the API using Dovetail API keys.
- Use the API as the data and authorization boundary; do not query the database directly.
- Implement read-only tools:
  - `list_knowledge_bases`.
  - `list_categories`.
  - `search_articles`.
  - `get_article`.
  - `get_article_citations`.
  - `suggest_related_articles`.
- Keep search tools snippet/chunk oriented and reserve full article content for `get_article`.
- Add integration tests with representative API key scopes.
- Update LibreChat integration docs for MCP configuration.

### 11. RAG API Completion

Current state:

- RAG search exists and enforces KB-scoped API keys.
- It returns article chunks only, not attachment chunks.
- It does not include last edited metadata.
- There are no machine-client endpoints for listing allowed KBs/categories or fetching full articles, which the MCP server will need.
- Existing `docs/integrations/librechat.md` examples are stale relative to the current required `knowledgeBaseIds` request body.

Required features:

- Add API-key-authenticated endpoints needed by MCP:
  - list allowed KBs.
  - list categories for allowed KBs.
  - get published article by ID/path.
  - citation metadata for articles/chunks.
  - related articles.
- Include attachment chunks in RAG search.
- Include source metadata required for citations, including KB, category path, article URL, and last edited metadata.
- Update LibreChat/RAG documentation to match current request body and MCP target.

### 12. Flowlu Import Completion

Current state:

- Flowlu ZIP import is implemented as a KB-scoped route and UI.
- Import route uses global `requireRole('admin')`, so a KB admin without global admin role cannot import.
- Import stores attachments but does not index attachment content.
- Import does not generate embeddings for imported articles.
- Existing design notes say tags were skipped in the import implementation.

Required features:

- Allow KB admins to run imports for their KB.
- Preserve/import Flowlu tags where available and map them to KB-scoped tags.
- Trigger full-text, semantic, and attachment indexing after import.
- Ensure imported published articles become available to search and AI retrieval without a manual reseed or separate script.
- Add import history UI if current admin pages do not expose past jobs clearly.
- Add tests covering KB-admin import authorization, tag import, and post-import indexing.

### 13. Admin UI For KB Access Policy And Permissions

Current state:

- Global admin can create/manage KBs.
- KB user role management exists.
- Category role management exists globally for user detail, but category-scoped management is not fully integrated into KB admin workflows.
- KB default access policy does not exist.

Required features:

- Add KB create/edit controls for org-visible vs private.
- Show default access policy in global and KB admin pages.
- Add KB-admin category permission management inside KB admin, scoped to that KB.
- Make effective permission state clear to admins, including inherited roles and overrides.
- Prevent admins from assigning category roles outside their authority.

### 14. Deployment: Azure VM Docker Compose Target

Current state:

- Docker Compose has `postgres`, `api`, and `web`.
- There is a `deploy/Caddyfile.example`, but Caddy is not part of compose.
- There is no MCP service.
- Postgres exposes port `5432` by default.
- There is no documented compose volume pattern for a separate Azure data disk.

Required features:

- Add `mcp` service to Docker Compose.
- Add `caddy` service to Docker Compose or provide a first-class VM deployment compose overlay that includes Caddy.
- Route `/` to web and `/api` to API through Caddy.
- Decide MCP exposure pattern for LibreChat and document it.
- Document mounting the Postgres data volume on a separate Azure data disk.
- Avoid exposing the database port publicly in production compose.
- Ensure uploaded files/attachments live on a persistent mounted volume included in backups.
- Add deployment docs specifically for Azure VM + Docker Compose + Caddy, distinct from Azure Container Apps.

### 15. Backup And Restore Automation

Current state:

- Deployment docs include a simple `pg_dump` example and daily cron suggestion.
- Retention policy in the PRD is not implemented or documented as an operational script.
- Uploaded attachments are not included in the backup example.

Required features:

- Add backup scripts or documented cron commands implementing:
  - daily backups retained for 7 days.
  - weekly backups retained for 7 weeks.
  - monthly backups retained for 7 months.
- Back up PostgreSQL and uploaded files.
- Add restore instructions for database and uploads together.
- Document backup storage location and permissions.
- Add a periodic restore-test procedure.

### 16. Health Checks And Operations

Current state:

- API has `/health`.
- Docker Compose has a Postgres healthcheck.
- Web and MCP health endpoints are not present.
- API health does not appear to verify database connectivity.

Required features:

- Add web health endpoint.
- Add MCP health endpoint after MCP service exists.
- Expand API health to include database connectivity, or add a deeper readiness endpoint.
- Add Docker Compose healthchecks for web, API, MCP, and Caddy where useful.
- Ensure logs are structured or at least consistently parseable for Docker-based operations.

### 17. Security Hardening

Current state:

- Sessions and API keys exist.
- API keys are hashed and revocable.
- Several routes do not yet enforce the PRD permission model.
- Attachment file serving, once mounted, would need stricter authorization.
- Production compose currently exposes Postgres port unless overridden.

Required features:

- Complete route-level authorization.
- Hide private KBs everywhere by default.
- Lock down attachment serving.
- Remove or restrict production database port exposure.
- Document production-only Entra configuration and disable dev auth in production.
- Review CORS and cookie settings for a Caddy-fronted single-domain deployment.

## Suggested Implementation Order

This is not a product roadmap; it is the dependency order that reduces rework.

1. Fix KB visibility semantics and authorization helpers.
2. Apply permission enforcement across existing routes and UI data loaders.
3. Add KB default access policy UI/API/schema.
4. Add last edited by metadata.
5. Build multi-KB search and stale-content discovery.
6. Mount and secure attachment routes, then add attachment management.
7. Add attachment text extraction/indexing.
8. Add DOCX conversion.
9. Complete Flowlu import indexing/tags/KB-admin authorization.
10. Add RAG support endpoints needed by MCP.
11. Build the MCP server and LibreChat docs.
12. Finish Azure VM Compose/Caddy deployment, backup scripts, and health checks.

