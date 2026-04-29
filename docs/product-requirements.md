# Dovetail Product Requirements Document

## Summary

Dovetail is an internal knowledge base for legal services organizations and adjacent operations teams. It gives staff a single governed place to create, organize, search, maintain, and reuse institutional knowledge. The product is designed for human lookup and for AI-assisted retrieval through a read-only MCP server backed by the same permission and publishing model as the web application.

Dovetail is a single-organization application. It supports multiple independently managed knowledge bases, but it is not intended to be a multi-tenant SaaS product.

## Product Goals

- Help internal staff quickly find reliable organization-specific knowledge.
- Let global admins create and govern multiple knowledge bases.
- Let knowledge base admins and editors maintain content without developer involvement.
- Support granular permissions at the knowledge base and category levels.
- Provide strong keyword, semantic, and hybrid search across one or more accessible knowledge bases.
- Keep all published knowledge ready for retrieval by LLM tools.
- Provide a read-only MCP server for LibreChat and other AI clients.
- Deploy conventionally on an Azure VM using Docker Compose, with clear separation between web, API, database, and MCP services.
- Keep operational requirements simple enough for an internally developed and maintained app.

## Non-Goals

- Multi-organization tenancy.
- Public internet publishing for anonymous users.
- Per-user identity passthrough from LibreChat to Dovetail.
- Complex legal review workflows beyond draft, published, and archived states.
- Automatic review reminders or escalation workflows.
- Costly enterprise backup, retention, or compliance tooling beyond a simple documented backup policy.

## Users

### Internal Staff

Internal staff include attorneys, paralegals, intake staff, operations staff, and other employees who need to find reliable internal knowledge.

Staff can:

- Sign in with Microsoft Entra ID.
- See only knowledge bases where they have an effective role.
- Browse categories and articles.
- Search across one, many, or all accessible knowledge bases.
- View published articles and attachments within their permissions.

### Editors

Editors are staff responsible for maintaining content in one or more knowledge bases or categories.

Editors can:

- Create and edit articles in areas where they have editor or admin access.
- Publish directly without a separate approval workflow.
- Archive articles.
- Upload and manage attachments.
- Identify stale content using search and sorting tools.

### Knowledge Base Admins

Knowledge base admins manage permissions and structure inside a specific knowledge base.

KB admins can:

- Manage categories in their KB.
- Manage users' KB-level and category-level roles inside their KB.
- Manage tags inside their KB.
- Import content into their KB.
- View KB-specific activity and content health.

### Global Admins

Global admins govern the application as a whole.

Global admins can:

- Create, update, and delete knowledge bases.
- Choose and later change whether a KB grants org-wide viewer access by default.
- Manage global users and global roles.
- Manage API keys for AI and external integrations.
- View global admin activity and operational status.

## Roles And Permissions

Dovetail uses three roles:

- `viewer`: can read published content in permitted scopes.
- `editor`: can create, edit, publish, and archive content in permitted scopes.
- `admin`: can manage users, permissions, categories, tags, imports, and settings in permitted scopes.

Permissions resolve through a cascading model:

1. Category-level role, including inherited category ancestors.
2. Knowledge-base-level role.
3. Global role.
4. Knowledge base default access policy.

The most specific role wins. Category-level permissions are a core feature, not an edge case.

Users only see knowledge bases where they have an effective role. When a global admin creates a knowledge base, they choose either:

- Org-visible: all current and future Entra-authenticated users receive viewer access by default.
- Private: no default viewer access; users must be assigned roles manually.

Global admins and KB admins can later change a knowledge base between org-visible and private.

## Authentication

Dovetail uses Microsoft Entra ID SSO for staff login.

Requirements:

- No local staff passwords.
- Users are created or synchronized on first successful Entra sign-in.
- Sessions are secure, HTTP-only, and suitable for deployment behind Caddy.
- Development environments may support local seeded identities for debugging, but production authentication is Entra ID.

## Knowledge Bases

A knowledge base is a top-level collection of related knowledge. Dovetail does not prescribe how an organization maps content into KBs; admins decide what merits being its own KB.

Each KB includes:

- Name.
- URL slug.
- Description.
- Default access policy: org-visible or private.
- Categories.
- Articles.
- Tags.
- KB-scoped user roles.
- Import history.
- Activity and content health summaries.

Users can switch between accessible KBs from the workspace UI.

## Categories

Categories provide nested structure inside a knowledge base.

Requirements:

- Categories can be nested multiple levels deep.
- Category slugs are unique among siblings within a KB.
- Category role assignments cascade to descendants unless overridden by a more specific category role.
- Users can browse articles by category.
- Editors can filter search and stale-content views by category.

## Articles

Articles are the primary knowledge objects.

Each article includes:

- Title.
- URL slug.
- Category.
- Rich text body.
- Status: draft, published, or archived.
- Tags.
- Attachments.
- Author.
- Last edited timestamp.
- Last edited by.
- Version history.

Published articles are visible to permitted viewers. Draft and archived articles are visible only to permitted editors/admins and are never exposed to AI retrieval.

Editors can publish directly. Dovetail does not require approval queues, review states, or scheduled publication.

## Rich Text Authoring

The editor must support practical legal and operational documentation patterns:

- Headings.
- Paragraphs.
- Bold, italic, and other common inline formatting.
- Links.
- Lists.
- Tables.
- Images.
- Callouts or warning blocks.
- Citation-oriented blocks or equivalent structured citation formatting.
- Attachments embedded or linked from article content where appropriate.

The editor should feel like a document editor, not a raw Markdown or HTML tool.

## Word Document Import

Dovetail must support uploading a Microsoft Word document and converting it into rich text suitable for publishing.

Requirements:

- Editors can upload a `.docx` file when creating or updating an article.
- The system converts headings, paragraphs, lists, tables, links, images, and basic inline formatting into the article rich text format.
- Unsupported or ambiguous formatting is handled gracefully.
- The converted content remains editable before publishing.
- The original Word document may be retained as an attachment if configured or selected by the editor.

## Attachments

Articles can have file attachments.

Requirements:

- Users with read access can download attachments on published articles.
- Editors can upload and manage attachments on articles they can edit.
- Attachments are indexed for keyword search, semantic search, and AI retrieval when technically supported by file type.
- Attachment search results identify the parent article and relevant file.
- Attachments are never exposed through AI retrieval unless the parent article is published and the API key has access to the article's KB.

## Version History

Dovetail keeps article version history.

Requirements:

- Each meaningful edit creates a restorable version snapshot.
- Editors can view a version list.
- Editors can restore a prior version if they have edit permission for the article.
- Visual diffs are not required.

## Tags

Tags provide cross-cutting classification within a knowledge base.

Requirements:

- Tags are scoped to a KB.
- Editors can apply tags to articles they can edit.
- Users can filter search results by tag.
- Tags should support imported content and manual authoring.

## Search

Search is a core product capability.

Users can:

- Search within one KB.
- Search across selected KBs.
- Search across all KBs where they have access.
- Filter by KB, category, tag, and last updated date.
- Limit results to articles they can edit when performing maintenance work.

Search modes:

- Full-text search for exact terms and legal phrases.
- Semantic search for natural-language and concept-based queries.
- Hybrid search combining full-text and semantic ranking.

Search results should include:

- Article title.
- KB name.
- Category path.
- Snippet or highlighted excerpt.
- Attachment matches when relevant.
- Last edited date.
- Last edited by when useful for maintenance views.
- Clear indication of whether a result came from article body or attachment content.

Only published content appears in standard viewer-facing search results. Draft and archived content may appear only in editor/admin maintenance views within the user's edit permissions.

## Stale Content Discovery

Dovetail does not require formal review workflows, but it must help editors find content that may be stale.

Editors can view and search articles by:

- Knowledge base.
- Category.
- Last updated date.
- Date created, when an article has never been meaningfully updated after creation.
- Only articles they can edit.

The UI should make it easy to find the oldest or longest-unchanged articles in a user's editing domain.

## AI Readiness

Dovetail's published knowledge must be ready for LLM retrieval.

Requirements:

- Published article text is converted into clean plain text for indexing.
- Published attachment text is extracted where supported.
- Content is chunked for retrieval.
- Chunks are embedded using OpenAI embeddings.
- Embeddings are refreshed when article or indexed attachment content changes.
- Draft and archived content is excluded from AI retrieval.
- Retrieval responses include source metadata sufficient for citations.

## RAG API

Dovetail exposes a REST API for retrieval-augmented generation.

Requirements:

- API keys authenticate machine clients.
- API keys are created and revoked manually by admins.
- Raw keys are shown once and stored only as secure hashes.
- API keys are scoped to one or more knowledge bases.
- API keys are not scoped by category.
- RAG retrieval accepts a query, limit, and one or more KB scopes allowed by the key.
- Results return relevant chunks, source article metadata, source URLs, and relevance scores.
- Only published content is returned.

## MCP Server

Dovetail includes a working read-only MCP server for LibreChat and other MCP clients.

The MCP server is a separate Docker Compose service. It communicates with Dovetail through the API, not by direct database access.

Authentication:

- The MCP server uses Dovetail API keys.
- Admins create separate API keys for different LibreChat agents or channels.
- Access is controlled by the KB scopes attached to each API key.
- Dovetail does not require LibreChat user identity passthrough.

MCP tools:

- `list_knowledge_bases`: returns KBs available to the configured API key.
- `list_categories`: returns category trees for allowed KBs.
- `search_articles`: performs semantic or hybrid search over allowed published content.
- `get_article`: returns full published article content and metadata.
- `get_article_citations`: returns source metadata and citation-ready references for articles or chunks.
- `suggest_related_articles`: returns related published articles based on article ID or query.

Tool behavior:

- Tools are read-only.
- Search-oriented tools return concise chunks/snippets by default.
- Full article content is returned only by `get_article`.
- Tool responses include article title, KB, category path, URL, and last edited metadata when useful.
- Tools never return draft or archived content.

## Import

Flowlu knowledge base import is a first-class launch feature.

Requirements:

- KB admins can upload a Flowlu export ZIP into a selected KB.
- The import flow previews the category tree, article count, attachment count, and warnings before execution.
- Admins can import articles as draft or published.
- Import runs as a background job with progress reporting.
- Imported attachments are preserved.
- Imported content is converted into Dovetail rich text.
- Imported published content is indexed for keyword search, semantic search, and AI retrieval.
- Import history is visible to KB admins.
- Import errors are recorded and visible.

## Admin Experience

Global admin requirements:

- Global admin dashboard.
- Create and manage KBs.
- Change a KB's default access policy.
- Manage global users and global roles.
- Manage API keys and KB scopes.
- View recent admin and content activity.

KB admin requirements:

- KB admin dashboard.
- Manage KB categories.
- Manage KB users and roles.
- Manage category-level permissions.
- Manage tags.
- Run imports.
- View import history.
- View content health, including stale-content indicators.

## Architecture

Dovetail should use a conventional service split:

- `web`: Next.js application for UI, Auth.js session handling, and server-rendered pages.
- `api`: Express or equivalent HTTP API for business logic, authorization, indexing orchestration, and data access.
- `db`: PostgreSQL with pgvector for relational data, full-text indexes, and vector embeddings.
- `mcp`: read-only MCP server backed by the API.
- `caddy`: reverse proxy and TLS termination.

The API is the authoritative boundary for permissions and data access. Web and MCP clients should not bypass API authorization by querying the database directly.

The codebase should maintain clear package ownership:

- Web UI code in the web app.
- API routes, middleware, and services in the API app.
- Schema, migrations, and database connection code in the DB package.
- Shared TypeScript types in a shared types package.
- MCP server code in its own app or service package.

Background work such as imports, document conversion, attachment text extraction, and embedding refresh may initially run inside the API service, but the architecture should allow moving it to a worker service if load or reliability requires it.

## Deployment

The primary deployment target is an Azure VM running Docker Compose.

Services:

- Caddy reverse proxy.
- Web app container.
- API container.
- MCP server container.
- PostgreSQL container with pgvector.

Requirements:

- Caddy terminates HTTPS.
- Caddy routes browser traffic to the web app and API traffic to the API service.
- PostgreSQL data is stored on a separate mounted disk from the VM OS disk.
- Environment variables and Docker secrets are documented clearly.
- Production uses Microsoft Entra ID SSO.
- OpenAI embedding configuration is supplied through environment variables.
- The deployment supports backup and restore procedures for the database and uploaded files.

## Backup And Retention

Dovetail uses a simple internal backup policy.

Requirements:

- Daily backups retained for 7 days.
- Weekly backups retained for 7 weeks.
- Monthly backups retained for 7 months.
- Backups include PostgreSQL data.
- Backups include uploaded attachments and imported files required by article content.
- Restore instructions are documented and periodically testable.
- Backup storage should be inexpensive and appropriate for an internal application.

## Observability And Operations

The application should provide enough operational visibility for internal maintenance.

Requirements:

- Health endpoints for web, API, MCP, and database connectivity.
- Structured logs suitable for `docker compose logs`.
- Clear startup behavior for migrations.
- Admin-visible API key last-used timestamps.
- Import job status and error logs.
- Embedding/indexing errors logged without blocking article publishing.

## Security

Requirements:

- Entra ID SSO for staff access.
- Secure session cookies.
- API keys stored as hashes, not plaintext.
- API keys revocable by admins.
- API keys scoped to KBs.
- Draft and archived content excluded from viewer search and AI retrieval.
- Permission checks enforced by the API.
- Caddy-managed HTTPS in production.
- Database port not publicly exposed in production.
- Uploaded files served only after permission checks.

## Success Criteria

Dovetail is successful when:

- Staff can find trustworthy internal knowledge faster than through shared drives, email, or ad hoc notes.
- Editors can maintain articles without developer support.
- Admins can create KBs and manage permissions confidently.
- Users only see KBs and content they are permitted to access.
- Search works across selected accessible KBs and returns useful snippets from articles and indexed attachments.
- Editors can identify stale articles in their editing domain.
- LibreChat can query Dovetail through the MCP server using KB-scoped API keys.
- Published content is consistently available for AI retrieval, while unpublished content is protected.
- The app can be deployed and maintained on an Azure VM with Docker Compose, Caddy, and a separate PostgreSQL data disk.
