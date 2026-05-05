# Docker Compose VM Deployment Guide

This guide deploys Dovetail on one Linux VM with Docker Compose, Caddy, PostgreSQL with pgvector, the API, the web app, persistent uploads storage, and the MCP server.

## Prerequisites

- Ubuntu 22.04 or newer Linux VM.
- A data disk mounted outside the OS disk, for example `/srv/dovetail`.
- DNS record for the public app host, for example `dovetail.example.com`.
- Docker Engine with the Docker Compose plugin.
- Git.
- Microsoft Entra app registration for production SSO.
- OpenAI API key or compatible embedding endpoint if semantic search/RAG is enabled.

## Disk Layout

Use the data disk for application state and backups:

```sh
sudo mkdir -p /srv/dovetail
sudo mkdir -p /var/backups/dovetail
sudo chown -R "$USER:$USER" /srv/dovetail
sudo chmod 0700 /var/backups/dovetail
```

Clone the repository under `/srv/dovetail`:

```sh
cd /srv/dovetail
git clone <repo-url> app
cd app
```

## Environment

Create a production env file:

```sh
cp .env.example .env.production
chmod 0600 .env.production
```

Set at least:

```sh
POSTGRES_DB=dovetail
POSTGRES_USER=dovetail
POSTGRES_PASSWORD=<strong-random-password>

DOVETAIL_DOMAIN=dovetail.example.com
NEXTAUTH_URL=https://dovetail.example.com
NEXT_PUBLIC_API_URL=https://dovetail.example.com
API_URL=http://api:3001
NEXTAUTH_SECRET=<openssl-rand-base64-32>
AUTH_TRUST_HOST=true
DEV_AUTH_ENABLED=false

OAUTH_PROVIDER=entra
ENTRA_CLIENT_ID=<client-id>
ENTRA_TENANT_ID=<tenant-id>
ENTRA_CLIENT_SECRET=<client-secret>

EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=<openai-api-key>

# MCP — no per-deployment secret. Each MCP client authenticates with a
# Dovetail admin-issued API key created at /admin/api-keys (see "MCP Keys").
```

Generate secrets with:

```sh
openssl rand -base64 32
```

## OAuth Setup

The redirect URI depends on `OAUTH_PROVIDER`:

```text
# OAUTH_PROVIDER=entra
https://dovetail.example.com/api/auth/callback/microsoft-entra-id

# OAUTH_PROVIDER=google
https://dovetail.example.com/api/auth/callback/google
```

Use the real value of `DOVETAIL_DOMAIN`. Register exactly the path shown above with your IdP.

## First Start

The VM Compose file is production-oriented. It starts `postgres`, `api`, `web`, `mcp`, and `caddy`. Only Caddy is exposed on ports `80` and `443`; Postgres, API, web, and MCP stay on the internal Docker network.

```sh
docker compose --env-file .env.production -f docker-compose.vm.yml up --build -d
docker compose --env-file .env.production -f docker-compose.vm.yml ps
```

Caddy obtains and renews HTTPS certificates automatically after DNS points at the VM and ports `80`/`443` are reachable.

## First Admin

After first login, promote the first user:

```sh
docker compose --env-file .env.production -f docker-compose.vm.yml exec postgres \
  psql -U dovetail -d dovetail \
  -c "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

Log out and back in after promotion.

## MCP Keys

The MCP service owns no secrets. External MCP clients authenticate by presenting a Dovetail admin-issued API key directly as the bearer on `/mcp` requests; the MCP service forwards that token verbatim to the RAG API, which validates it and applies its KB scope. Issue one key per agent/integration and scope each to the KBs that agent should reach.

Setup after first login:

1. Log in as an admin.
2. Go to `/admin/api-keys`.
3. Create a key, scope it to the desired KBs, copy the value.
4. Configure the MCP client (e.g. LibreChat) with `Authorization: Bearer <the-key>` for that agent. Repeat steps 3–4 for each agent that needs a different KB scope.

The Caddy config exposes `/mcp*` as a passthrough; auth is enforced by the RAG API on every tool call. Requests without an `Authorization: Bearer …` header get `401` at the MCP layer; requests with an invalid or revoked key get `401` from the upstream RAG API.

## Health Checks

Local checks on the VM:

```sh
curl -fsS http://localhost/api/health
docker compose --env-file .env.production -f docker-compose.vm.yml ps
docker compose --env-file .env.production -f docker-compose.vm.yml logs -f api web mcp caddy
```

Service endpoints:

- API liveness inside Compose: `http://api:3001/health`
- API readiness with database check inside Compose: `http://api:3001/ready`
- Web liveness through Caddy: `/api/health`
- MCP liveness inside Compose: `http://mcp:3002/health`
- MCP upstream probe inside Compose: `http://mcp:3002/health?deep=1`

## Post-Deploy Verification

After `docker compose ... up -d` completes, verify the public surface from outside the VM:

```sh
# All services healthy.
docker compose --env-file .env.production -f docker-compose.vm.yml ps

# Web health (public). Expect: 200.
curl -i https://$DOVETAIL_DOMAIN/api/health

# Express API reachable through Caddy. Expect: 401 when signed out
# (proves traffic reaches Express, not Next-only health).
curl -i https://$DOVETAIL_DOMAIN/api/me

# MCP rejects unauthenticated requests. Expect: 401.
curl -i https://$DOVETAIL_DOMAIN/mcp

# MCP accepts a valid Dovetail API key. Expect: 200 with text/event-stream
# body. Substitute a key minted at /admin/api-keys.
curl -i -H "Authorization: Bearer $DOVETAIL_API_KEY" -X POST \
  https://$DOVETAIL_DOMAIN/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"verify","version":"0"}}}'

# MCP upstream (Dovetail RAG /health) reachable. Expect: upstreamReachable:
# true. Run from inside the VM. This does not exercise an API key.
docker compose --env-file .env.production -f docker-compose.vm.yml exec mcp \
  wget -qO- 'http://localhost:3002/health?deep=1'
```

Sign in via OAuth, then load `/admin/api-keys` and confirm the admin UI loads without `API error: 401 Unauthorized`. That validates the secure session cookie + Express auth path end-to-end over HTTPS.

## Backups

Backups include:

- PostgreSQL custom-format dump.
- Uploaded files and imported attachment files from the uploads volume.
- A small manifest with timestamp, project name, database name, and git SHA.

Install the cron entry:

```sh
sudo deploy/scripts/install-cron.sh
```

By default the cron job runs daily at 02:15 UTC and writes to `/var/backups/dovetail`.

Retention:

- Daily backups retained for 7 days.
- Weekly backups retained for 7 weeks.
- Monthly backups retained for about 7 months.

Run a manual backup:

```sh
ENV_FILE=.env.production COMPOSE_FILE=docker-compose.vm.yml BACKUP_ROOT=/var/backups/dovetail \
  deploy/scripts/backup.sh
```

Force a weekly or monthly backup:

```sh
BACKUP_TIER=weekly deploy/scripts/backup.sh
BACKUP_TIER=monthly deploy/scripts/backup.sh
```

Keep backup directories readable only by operators who are allowed to access production data:

```sh
sudo chmod -R go-rwx /var/backups/dovetail
```

## Restore

Test archive structure without changing data:

```sh
DRY_RUN=true deploy/scripts/restore.sh /var/backups/dovetail/daily/<backup>.tar.gz
```

Restore replaces the current database and uploads volume:

```sh
deploy/scripts/restore.sh /var/backups/dovetail/daily/<backup>.tar.gz
```

The script stops write-capable services, recreates the database, restores uploads, restarts the stack, and prints service status.

## Updates

Pull the new revision, rebuild, and restart:

```sh
git pull
docker compose --env-file .env.production -f docker-compose.vm.yml up --build -d
docker compose --env-file .env.production -f docker-compose.vm.yml ps
```

API migrations run on API container startup.

Run a backup before production updates:

```sh
BACKUP_TIER=daily deploy/scripts/backup.sh
```

## Troubleshooting

Check Caddy and app logs:

```sh
docker compose --env-file .env.production -f docker-compose.vm.yml logs -f caddy
docker compose --env-file .env.production -f docker-compose.vm.yml logs -f api web mcp
```

Common issues:

- HTTPS does not issue: verify DNS, public ports `80` and `443`, and `DOVETAIL_DOMAIN`.
- OAuth redirect fails: verify the Entra redirect URI and `NEXTAUTH_URL`.
- API is unhealthy: run `docker compose ... logs api` and check `/ready`.
- Login works but API calls fail: `NEXT_PUBLIC_API_URL` should be the public HTTPS origin.
- Attachments are missing after restore: confirm the backup archive contains `uploads.tar.gz` and the restore completed without errors.
- MCP tools fail with `unauthorized`: the API key the client is presenting is missing, invalid, or revoked. Confirm the client sends `Authorization: Bearer <key>` and that the key still exists at `/admin/api-keys`. Run `curl http://mcp:3002/health?deep=1` from inside the Compose network to check upstream reachability — `upstreamReachable: false` means MCP cannot reach the Dovetail API at all.
- MCP tools fail with `forbidden`: the presented key is valid but not scoped to the requested KB. Edit the key at `/admin/api-keys` to add the KB.
- External MCP clients get `401` from `/mcp`: the `Authorization` header is missing or not a `Bearer` value. Token validity is enforced by the RAG API on the first tool call, not at `/mcp` itself.
