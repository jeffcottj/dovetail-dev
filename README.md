<img width="935" height="244" alt="Dovetail" src="https://github.com/user-attachments/assets/b2895d49-81dd-4b59-9c8f-440f8a9000f8" />

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

Dovetail runs as three Docker containers — a web app, an API server, and a PostgreSQL database. A single `docker compose` command starts everything.

### Prerequisites

- A Linux server (or VM) with [Docker](https://docs.docker.com/engine/install/) installed
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

Then visit `http://your-server:3000`, sign in, and promote yourself to admin:

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

See the [full deployment guide](docs/explainers/deployment-guide.md) for detailed instructions, HTTPS setup, backups, and troubleshooting.

## How It Works

```
Browser  ──►  Web App (:3000)  ──►  API Server (:3001)  ──►  PostgreSQL
                    │
                    └── Google / Microsoft sign-in
```

- The **web app** is what your team sees — article pages, the editor, search, and the admin panel.
- The **API server** handles all data operations — creating articles, running searches, managing users, and serving the RAG endpoint.
- **PostgreSQL** stores everything: articles, user accounts, version history, search indexes, and embeddings.

All three run in Docker. In production, you should put a reverse proxy (like [Caddy](https://caddyserver.com/)) in front to handle HTTPS — the [deployment guide](docs/explainers/deployment-guide.md#step-5-set-up-https-strongly-recommended) explains how.

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
pnpm install
docker compose up postgres -d       # Start only the database
pnpm dev                            # Start web + API with hot reload
```

The web app runs on `http://localhost:3000` and the API on `http://localhost:3001`.

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

The `docs/explainers/` folder contains plain-language writeups of each development phase:

- [Deployment Guide](docs/explainers/deployment-guide.md) — step-by-step first-time setup
- [Phase 1: Scaffold](docs/explainers/phase1.md) — project setup
- [Phase 2: Database Schema](docs/explainers/phase2.md) — data model
- [Phase 3: Authentication](docs/explainers/phase3.md) — OAuth login
- [Phase 3.9: Build Fix](docs/explainers/phase3.9.md) — monorepo build issues
- [Phase 4: Authorization](docs/explainers/phase4.md) — roles and permissions
- [Phase 5: Core API](docs/explainers/phase5.md) — articles, categories, versions
- [Phase 6: Frontend](docs/explainers/phase6.md) — web interface
- [Phase 7: Search](docs/explainers/phase7.md) — full-text search
- [Phase 8: Semantic Search](docs/explainers/phase8.md) — embeddings and hybrid search
- [Phase 9: RAG API](docs/explainers/phase9.md) — AI integration endpoint
- [Phase 10: Polish & Production](docs/explainers/phase10.md) — tags, admin UI, Docker builds

## License

MIT
