<img width="330" height="80" alt="with-text" src="https://github.com/user-attachments/assets/a335c4f2-272e-4cd3-a1e1-60dfcf711f19" />

# Dovetail

A knowledge base for legal services organizations. Dovetail gives your team a shared place to write, organize, and search legal reference content — and optionally exposes it to AI tools through a built-in RAG API.

Built by [Maryland Legal Aid](https://www.mdlab.org). Free and open source.

## Why Dovetail?

Legal aid staff spend time hunting for answers that someone in the organization already wrote down — buried in shared drives, old emails, or someone's personal notes. Dovetail puts that knowledge in one searchable place:

- **Organized by topic.** Articles live in a hierarchy of categories (e.g., Housing > Evictions > Notice Requirements). Nest them as deep as you need.
- **Version history.** Every edit is saved. You can always see who changed what and when, and refer back to previous versions.
- **Powerful search.** Full-text keyword search works out of the box. Optionally enable semantic search to find articles by meaning, not just exact wording — helpful when legal concepts go by many names.
- **Role-based access.** Three roles — viewer, editor, and admin — control who can read, who can write, and who can manage the system. Roles can be assigned globally or per-category (e.g., make someone an editor only for "Family Law").
- **AI-ready.** A built-in RAG API lets tools like LibreChat query your knowledge base, so your team can get AI-assisted answers grounded in your own vetted content.
- **Single sign-on.** Staff log in with their existing Google or Microsoft account. No separate passwords to manage.
- **Tags.** Apply cross-cutting labels to articles across categories. Filter search results by tag.
- **Self-hosted.** Runs on your own server. You control the data.

## Getting Started

Dovetail runs in Docker: the web app, API server, MCP server, PostgreSQL with pgvector, and persistent uploads storage. A production VM deployment also includes Caddy for HTTPS.

### Prerequisites

- A Linux server, VM, or local machine with [Docker](https://docs.docker.com/engine/install/) installed
- A Google or Microsoft OAuth application for login ([setup instructions](docs/explainers/deployment-guide.md#oauth-setup))
- Optionally, an [OpenAI API key](https://platform.openai.com/api-keys) for semantic search

### Quick Start

```bash
git clone https://github.com/MarylandLegalAid/dovetail.git
cd dovetail
cp .env.example .env
# Edit .env with your settings (see below)
docker compose up --build -d
```

The default Compose file exposes the web app on `http://localhost:3000` and the API on `http://localhost:3001`. For production, use the [Docker Compose VM deployment guide](docs/explainers/deployment-guide.md), which adds Caddy, HTTPS, backups, and restore steps.

After first sign-in, promote yourself to admin:

```bash
docker compose exec postgres psql -U dovetail -d dovetail -c \
  "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

Log out and back in, and you'll have full admin access — including the ability to manage other users' roles from the web interface.

### Configuration

Copy `.env.example` to `.env` and fill in these values:

| Variable | What it is |
|----------|-----------|
| `POSTGRES_PASSWORD` | A strong password for the database |
| `DATABASE_URL` | Connection string (update the password to match) |
| `NEXTAUTH_SECRET` | A random string for session encryption (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Your site's public URL (e.g., `https://dovetail.yourorg.org`) |
| `OAUTH_PROVIDER` | `google` or `entra` (Microsoft) |
| `GOOGLE_CLIENT_ID` / `SECRET` | From Google Cloud Console (if using Google) |
| `ENTRA_CLIENT_ID` / `SECRET` / `TENANT_ID` | From Azure Portal (if using Microsoft) |
| `OPENAI_API_KEY` | For semantic search (optional) |

See the [full deployment guide](docs/explainers/deployment-guide.md) for production setup, HTTPS, backups, restore, updates, and troubleshooting.

## Deployment

Dovetail’s supported production deployment path is **[Docker Compose on a Linux VM](docs/explainers/deployment-guide.md)**. The production Compose file runs Postgres, API, web, MCP, and Caddy on one host, stores database and uploaded attachment data in Docker volumes, and includes backup/restore scripts.

## How It Works

```
Browser  ──►  Caddy (:443)  ──►  Web App (:3000)  ──►  API Server (:3001)  ──►  PostgreSQL
                                      │                         │
                                      │                         ├── uploads volume
                                      │                         └── MCP server (:3002)
                                      └── Google / Microsoft sign-in
```

- The **web app** is what your team sees — article pages, the editor, search, and the admin panel.
- The **API server** handles all data operations — creating articles, running searches, managing users, and serving the RAG endpoint.
- The **MCP server** lets compatible tools query Dovetail through scoped API keys.
- **PostgreSQL** stores everything: articles, user accounts, version history, search indexes, and embeddings.
- The **uploads volume** stores attachment files imported or uploaded through the app.

The production Compose file includes [Caddy](https://caddyserver.com/) so only HTTPS is exposed publicly.

## For Developers

Dovetail is a TypeScript monorepo managed with [pnpm](https://pnpm.io/):

```
apps/web/        Next.js 15 frontend (App Router, React 19)
apps/api/        Express 5 REST API
packages/types/  Shared TypeScript interfaces
packages/db/     Drizzle ORM schema, migrations, connection
```

### Local Development

```bash
# Install just first: https://github.com/casey/just
just setup
just dev
```

The web app runs on `http://localhost:3000` and the API on `http://localhost:3001`.

For local debugging, `.env.example` enables seeded dev auth by default. That gives you three local sign-in identities on `/login` and avoids blocking on Google/Microsoft setup while you debug locally.

Common local-debug commands:

```bash
just doctor        # Check env, docker access, deps, and ports
just db-reset      # Wipe Postgres volume, migrate, and reseed known-good data
just logs-db       # Tail Postgres logs
just smoke         # Repeatable read-only smoke test against the running local stack
just smoke-ai      # Optional semantic/RAG smoke test (requires embedding config)
```

### Running Tests

```bash
pnpm test                           # All tests
pnpm --filter @dovetail/api test    # API tests only
```

### Database Migrations

```bash
pnpm --filter @dovetail/db db:generate   # Generate migration from schema changes
pnpm --filter @dovetail/db db:migrate    # Apply pending migrations
pnpm --filter @dovetail/db db:studio     # Visual database browser
```

Migrations run automatically when the API container starts in production — no manual step needed after deploying updates.

## Documentation

- [Deployment Guide](docs/explainers/deployment-guide.md) — production Docker Compose VM setup, HTTPS, backups, restore, and updates
- [MCP Integration](docs/integrations/mcp.md) — MCP server setup and tool surface
- [LibreChat Integration](docs/integrations/librechat.md) — using Dovetail from LibreChat
- [RAG API](docs/integrations/rag-api.md) — API key based RAG endpoints
- [Product Requirements](docs/product-requirements.md) — product scope and expected behavior

## License

MIT
