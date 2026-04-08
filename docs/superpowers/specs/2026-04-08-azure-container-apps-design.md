# Azure Container Apps Deployment Design

**Date:** 2026-04-08
**Goal:** Make Dovetail deployable to Azure Container Apps + Azure Database for PostgreSQL Flexible Server, without breaking or complicating the existing Docker Compose on VM deployment path.

**Approach:** Environment-driven configuration. The application code remains deployment-agnostic. All Azure-vs-VM differences are handled through environment variables. The same Docker images run in both environments. Azure infrastructure is defined in Bicep templates that live alongside the existing compose file.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Container topology | Two Container Apps (web + api) | 1:1 mapping from compose; web needs server-side Auth.js + SSR |
| Database | Azure Database for PostgreSQL Flexible Server | Managed, pgvector support, automated backups |
| Container registry | Azure Container Registry (Basic SKU) | Pipeline details deferred; ACR is the target |
| SSL to Postgres | Enforced (Azure default) | Secure; requires a small code change in connection.ts |
| Networking | Both apps publicly accessible | RAG endpoint needs external access; API is already auth-protected |
| IaC | Bicep templates in `infra/` | Azure-native, checked into the repo |

---

## Code Changes

### `packages/db/src/connection.ts`

Add conditional SSL support. When `DATABASE_URL` contains `sslmode=require` (standard in Azure connection strings) or `DB_SSL=true` is set, pass `ssl: true` to the `postgres()` driver. Otherwise, no SSL (current behavior for local Docker Compose).

```ts
const ssl = connectionString.includes('sslmode=require') || process.env.DB_SSL === 'true';
export const client = postgres(connectionString, { ssl: ssl ? { rejectUnauthorized: true } : false });
```

Azure Flexible Server uses a publicly trusted CA, so `rejectUnauthorized: true` (the default) works without bundling a custom CA cert.

**No other application code changes.** `next.config.ts`, Dockerfiles, and all service code remain untouched. The same images run on both targets.

---

## Bicep Infrastructure (`infra/`)

All Azure resources are defined as Bicep templates in `infra/` at the repo root.

### File Structure

```
infra/
  main.bicep              # Orchestrator — accepts parameters, wires modules
  main.bicepparam         # Parameter file template (placeholder values, like .env.example)
  modules/
    registry.bicep        # Azure Container Registry (Basic SKU)
    postgres.bicep        # PostgreSQL Flexible Server + pgvector
    container-apps.bicep  # Container Apps Environment + web and api apps
```

### `main.bicep`

Accepts parameters:
- `appName` (prefix for all resource names)
- `location` (Azure region)
- `postgresAdminPassword`
- `nextAuthSecret`
- OAuth credentials (provider, client ID, client secret, tenant ID)
- Embedding configuration (provider, model, API key)
- RAG API key

Passes parameters to each module and wires outputs (e.g., Postgres connection string) into dependent modules.

### `modules/registry.bicep`

- Azure Container Registry, Basic SKU
- Outputs the login server URL for image push/pull

### `modules/postgres.bicep`

- Azure Database for PostgreSQL Flexible Server
- SKU: Burstable B1ms (cheapest tier, adequate to start)
- PostgreSQL version 16 (matches `pgvector/pgvector:pg16` used in compose)
- `azure.extensions` server parameter set to allow `vector` (pgvector)
- SSL enforced (server default)
- Firewall rule: allow Azure services (so Container Apps can connect)
- Creates the `dovetail` database
- Outputs the full connection string (with `sslmode=require`)

### `modules/container-apps.bicep`

- Container Apps Environment (shared by both apps; provides internal DNS)
- **api** Container App:
  - Image from ACR
  - Ingress: external, port 3001
  - Environment variables: `DATABASE_URL` (from Postgres module), `PORT`, `NEXTAUTH_SECRET`, `OAUTH_PROVIDER`, embedding config
  - Secrets: database password, NEXTAUTH_SECRET, OAuth secrets, OpenAI key
  - Startup probe: HTTP GET on `/api/health`, initial delay 30s, timeout 240s (allows time for migrations on first deploy)
  - Min replicas: 1 (always on — avoids cold start on first request)
- **web** Container App:
  - Image from ACR
  - Ingress: external, port 3000
  - Environment variables: `API_URL` set to the api container app's external FQDN (`https://<api-app-name>.<env-default-domain>`), `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, OAuth credentials, `AUTH_TRUST_HOST=true`
  - Min replicas: 1

### What Bicep Does NOT Provision

- **Custom domains or TLS certs.** Azure Container Apps provides `*.azurecontainerapps.io` with automatic HTTPS. Custom domains are an incremental add-on.
- **CI/CD pipeline.** Deferred. Images are pushed to ACR manually or via a future pipeline.
- **VNet.** Both apps are public. Can be added later if compliance requires it.
- **Monitoring / Log Analytics.** Container Apps Environment creates a default Log Analytics workspace. No custom dashboards or alerts.

---

## Migration and Seeding

### Migrations

The existing API container CMD handles this:

```sh
node packages/db/dist/migrate.js && node apps/api/dist/index.js
```

This works identically on Azure Container Apps. Migrations run on every container start before the server accepts traffic. The Bicep startup probe gives the container up to 240 seconds to complete migrations before Azure considers it unhealthy.

### Seeding

The seed script is dev-only. It does NOT run on Azure. The first admin is promoted via SQL, using `az postgres flexible-server execute` instead of `docker compose exec postgres psql`. This is documented in the Azure deployment guide, not automated.

---

## Documentation

### New: `infra/README.md`

Azure deployment guide, parallel to `docs/explainers/deployment-guide.md`. Covers:

- Prerequisites (Azure subscription, `az` CLI installed, OAuth app registered)
- Deploying with Bicep (`az deployment group create --template-file infra/main.bicep --parameters @infra/main.bicepparam`)
- Building and pushing images to ACR (`az acr build`)
- Setting secrets (NEXTAUTH_SECRET, OAuth creds, embedding keys)
- Promoting the first admin (`az postgres flexible-server execute`)
- Verifying the deployment
- Updating (push new images, restart container revisions)

### Updated: `README.md` (root)

Add a "Deployment" section between "Getting Started" and "How It Works" with two bullet points:

- **Docker Compose on a VM** — link to `docs/explainers/deployment-guide.md`
- **Azure Container Apps** — link to `infra/README.md`

Lightly edit the "Getting Started" intro to acknowledge two deployment paths, with compose as the quick-start default.

### Updated: `.env.example`

Add a comment noting `DB_SSL=true` as an optional override for Azure or any Postgres host requiring SSL. No structural changes.

### Unchanged

- `docs/explainers/deployment-guide.md` (VM guide) — untouched
- `Justfile` — untouched
- `docker-compose.yml` — untouched

---

## What Does NOT Change

To be explicit about the "dual deployment" promise:

- `docker-compose.yml` is not modified
- All Dockerfiles are not modified
- The Justfile and all `just` recipes are not modified
- The VM deployment guide is not modified
- No `if (isAzure)` conditional logic in application code
- The only application code change is SSL handling in `connection.ts`, which is backwards-compatible (no SSL when the env var / connection string doesn't request it)
