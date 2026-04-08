# Azure Container Apps Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dovetail deployable to Azure Container Apps + Azure Database for PostgreSQL Flexible Server, while keeping the existing Docker Compose on VM path fully intact.

**Architecture:** Environment-driven configuration. The only application code change is conditional SSL in the DB connection. Azure infrastructure is defined in Bicep templates under `infra/`. The same Docker images run on both targets.

**Tech Stack:** Azure Bicep, Azure Container Apps, Azure Database for PostgreSQL Flexible Server, Azure Container Registry, postgres.js (SSL options), Vitest

---

## File Map

### New Files

```
infra/
  main.bicep                  # Orchestrator — parameters, module wiring, outputs
  main.bicepparam             # Parameter file template (placeholder values)
  modules/
    registry.bicep            # Azure Container Registry (Basic SKU)
    postgres.bicep            # PostgreSQL Flexible Server + pgvector + firewall
    container-apps.bicep      # Container Apps Environment + web and api apps
  README.md                   # Azure deployment guide
```

### Modified Files

```
packages/db/src/connection.ts           # Add conditional SSL support
packages/db/src/__tests__/connection.test.ts  # Add SSL unit tests
.env.example                            # Add DB_SSL comment
README.md                               # Add Deployment section
```

---

## Task 1: Add SSL Support to Database Connection

The only application code change. Make `packages/db/src/connection.ts` pass `ssl: { rejectUnauthorized: true }` to the `postgres()` driver when the connection string contains `sslmode=require` or `DB_SSL=true` is set.

**Files:**
- Modify: `packages/db/src/connection.ts`
- Modify: `packages/db/src/__tests__/connection.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `packages/db/src/__tests__/connection.test.ts` that tests the SSL parsing logic. Since the `postgres()` client is created at module load time and connects to a real database, we need to test the SSL logic in isolation by extracting it into a pure function.

First, add this test block at the end of the existing test file:

```ts
import { parseSslOption } from '../connection.js';

describe('parseSslOption', () => {
  it('returns false when no SSL indicators are present', () => {
    expect(parseSslOption('postgres://user:pass@localhost:5432/db', undefined)).toBe(false);
  });

  it('returns ssl config when connection string contains sslmode=require', () => {
    expect(
      parseSslOption('postgres://user:pass@host:5432/db?sslmode=require', undefined)
    ).toEqual({ rejectUnauthorized: true });
  });

  it('returns ssl config when DB_SSL is true', () => {
    expect(parseSslOption('postgres://user:pass@localhost:5432/db', 'true')).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('returns false when DB_SSL is not true', () => {
    expect(parseSslOption('postgres://user:pass@localhost:5432/db', 'false')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/db && pnpm vitest run src/__tests__/connection.test.ts`

Expected: FAIL — `parseSslOption` is not exported from `../connection.js`

- [ ] **Step 3: Implement parseSslOption and update connection**

Replace the full contents of `packages/db/src/connection.ts` with:

```ts
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resolve } from 'node:path';
import * as schema from './schema.js';

config({ path: resolve(__dirname, '../../../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export function parseSslOption(
  connStr: string,
  dbSslEnv: string | undefined,
): { rejectUnauthorized: true } | false {
  if (connStr.includes('sslmode=require') || dbSslEnv === 'true') {
    return { rejectUnauthorized: true };
  }
  return false;
}

const ssl = parseSslOption(connectionString, process.env.DB_SSL);

export const client = postgres(connectionString, { ssl });
export const db = drizzle(client, { schema });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/db && pnpm vitest run src/__tests__/connection.test.ts`

Expected: All tests PASS (both the existing `database connection` suite and the new `parseSslOption` suite)

- [ ] **Step 5: Run the full test suite to confirm nothing is broken**

Run: `pnpm test`

Expected: All tests pass across all packages.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/connection.ts packages/db/src/__tests__/connection.test.ts
git commit -m "feat(db): add conditional SSL support for managed Postgres"
```

---

## Task 2: Update .env.example

Add a comment documenting the `DB_SSL` env var.

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add DB_SSL comment to .env.example**

Add the following after the `DATABASE_URL` line in `.env.example`:

```env
# SSL — set to true for Azure or any Postgres host requiring SSL.
# Not needed for local Docker Compose (no SSL).
# DB_SSL=true
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add DB_SSL option to .env.example"
```

---

## Task 3: Bicep — Container Registry Module

Create the ACR module.

**Files:**
- Create: `infra/modules/registry.bicep`

- [ ] **Step 1: Create the infra/modules directory**

```bash
mkdir -p infra/modules
```

- [ ] **Step 2: Write registry.bicep**

Create `infra/modules/registry.bicep`:

```bicep
@description('Name of the container registry')
param name string

@description('Azure region')
param location string = resourceGroup().location

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: name
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

@description('ACR login server (e.g. myregistry.azurecr.io)')
output loginServer string = acr.properties.loginServer

@description('ACR resource name')
output name string = acr.name
```

- [ ] **Step 3: Validate the template**

Run: `az bicep build --file infra/modules/registry.bicep`

Expected: No errors. Produces no output on success (exit code 0). If the `az` CLI is not installed, skip this step — validation will happen when the full stack is deployed.

- [ ] **Step 4: Commit**

```bash
git add infra/modules/registry.bicep
git commit -m "infra: add Azure Container Registry Bicep module"
```

---

## Task 4: Bicep — PostgreSQL Flexible Server Module

Create the Postgres module with pgvector, SSL enforcement, and firewall rule for Azure services.

**Files:**
- Create: `infra/modules/postgres.bicep`

- [ ] **Step 1: Write postgres.bicep**

Create `infra/modules/postgres.bicep`:

```bicep
@description('Name of the PostgreSQL server')
param name string

@description('Azure region')
param location string = resourceGroup().location

@description('Administrator login username')
param adminLogin string = 'dovetail'

@secure()
@description('Administrator login password')
param adminPassword string

@description('Name of the database to create')
param databaseName string = 'dovetail'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: name
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// Allow Azure services (Container Apps) to connect
resource firewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Enable pgvector extension
resource pgvectorConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR'
    source: 'user-override'
  }
}

// Create the application database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

@description('Full connection string with sslmode=require')
output connectionString string = 'postgres://${adminLogin}:PASSWORD@${server.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

@description('Server FQDN')
output fqdn string = server.properties.fullyQualifiedDomainName
```

Note: The connection string output uses `PASSWORD` as a placeholder — the actual password is passed as a secret to Container Apps, and the full `DATABASE_URL` is assembled in `main.bicep` to avoid exposing the password in Bicep outputs.

- [ ] **Step 2: Validate the template**

Run: `az bicep build --file infra/modules/postgres.bicep`

Expected: No errors (exit code 0). Skip if `az` CLI is not installed.

- [ ] **Step 3: Commit**

```bash
git add infra/modules/postgres.bicep
git commit -m "infra: add PostgreSQL Flexible Server Bicep module"
```

---

## Task 5: Bicep — Container Apps Module

Create the Container Apps Environment and both container apps (api + web).

**Files:**
- Create: `infra/modules/container-apps.bicep`

- [ ] **Step 1: Write container-apps.bicep**

Create `infra/modules/container-apps.bicep`:

```bicep
@description('Base name for resources')
param appName string

@description('Azure region')
param location string = resourceGroup().location

@description('ACR login server (e.g. myregistry.azurecr.io)')
param acrLoginServer string

@description('ACR name (for managed identity pull)')
param acrName string

@description('Container image tag')
param imageTag string = 'latest'

// -- Secrets (passed as secure params) --

@secure()
@description('Full DATABASE_URL including password and sslmode=require')
param databaseUrl string

@secure()
@description('NEXTAUTH_SECRET for session encryption')
param nextAuthSecret string

@description('OAuth provider: google or entra')
param oauthProvider string = 'google'

@secure()
@description('Google OAuth client ID')
param googleClientId string = ''

@secure()
@description('Google OAuth client secret')
param googleClientSecret string = ''

@secure()
@description('Entra client ID')
param entraClientId string = ''

@secure()
@description('Entra client secret')
param entraClientSecret string = ''

@description('Entra tenant ID')
param entraTenantId string = ''

@description('Embedding provider: openai or ollama')
param embeddingProvider string = 'openai'

@description('Embedding model name')
param embeddingModel string = 'text-embedding-3-small'

@secure()
@description('OpenAI API key for embeddings')
param openaiApiKey string = ''

@description('Embedding base URL (for Ollama or custom endpoint)')
param embeddingBaseUrl string = ''

@secure()
@description('RAG API key')
param ragApiKey string = ''

// -- Log Analytics workspace (required by Container Apps Environment) --

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// -- Container Apps Environment --

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// -- ACR pull credential --

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// -- API Container App --

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${appName}-api'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'database-url', value: databaseUrl }
        { name: 'nextauth-secret', value: nextAuthSecret }
        { name: 'google-client-id', value: googleClientId }
        { name: 'google-client-secret', value: googleClientSecret }
        { name: 'entra-client-id', value: entraClientId }
        { name: 'entra-client-secret', value: entraClientSecret }
        { name: 'openai-api-key', value: openaiApiKey }
        { name: 'rag-api-key', value: ragApiKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acrLoginServer}/dovetail-api:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'PORT', value: '3001' }
            { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret' }
            { name: 'OAUTH_PROVIDER', value: oauthProvider }
            { name: 'EMBEDDING_PROVIDER', value: embeddingProvider }
            { name: 'EMBEDDING_MODEL', value: embeddingModel }
            { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
            { name: 'EMBEDDING_BASE_URL', value: embeddingBaseUrl }
            { name: 'RAG_API_KEY', secretRef: 'rag-api-key' }
          ]
          probes: [
            {
              type: 'startup'
              httpGet: {
                path: '/api/health'
                port: 3001
              }
              initialDelaySeconds: 30
              periodSeconds: 10
              failureThreshold: 20
              timeoutSeconds: 5
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

// -- Web Container App --

resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${appName}-web'
  location: location
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          server: acrLoginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password-web'
        }
      ]
      secrets: [
        { name: 'acr-password-web', value: acr.listCredentials().passwords[0].value }
        { name: 'nextauth-secret-web', value: nextAuthSecret }
        { name: 'google-client-id-web', value: googleClientId }
        { name: 'google-client-secret-web', value: googleClientSecret }
        { name: 'entra-client-id-web', value: entraClientId }
        { name: 'entra-client-secret-web', value: entraClientSecret }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${acrLoginServer}/dovetail-web:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'API_URL', value: 'https://${apiApp.properties.configuration.ingress.fqdn}' }
            { name: 'NEXTAUTH_URL', value: 'https://${appName}-web.${environment.properties.defaultDomain}' }
            { name: 'NEXTAUTH_SECRET', secretRef: 'nextauth-secret-web' }
            { name: 'OAUTH_PROVIDER', value: oauthProvider }
            { name: 'GOOGLE_CLIENT_ID', secretRef: 'google-client-id-web' }
            { name: 'GOOGLE_CLIENT_SECRET', secretRef: 'google-client-secret-web' }
            { name: 'ENTRA_CLIENT_ID', secretRef: 'entra-client-id-web' }
            { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret-web' }
            { name: 'ENTRA_TENANT_ID', value: entraTenantId }
            { name: 'AUTH_TRUST_HOST', value: 'true' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

@description('API app external FQDN')
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'

@description('Web app external FQDN')
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
```

- [ ] **Step 2: Validate the template**

Run: `az bicep build --file infra/modules/container-apps.bicep`

Expected: No errors (exit code 0). Skip if `az` CLI is not installed.

- [ ] **Step 3: Commit**

```bash
git add infra/modules/container-apps.bicep
git commit -m "infra: add Container Apps Environment Bicep module"
```

---

## Task 6: Bicep — Main Orchestrator and Parameter File

Wire the modules together in `main.bicep` and create the parameter template.

**Files:**
- Create: `infra/main.bicep`
- Create: `infra/main.bicepparam`

- [ ] **Step 1: Write main.bicep**

Create `infra/main.bicep`:

```bicep
targetScope = 'resourceGroup'

// -- Required parameters --

@description('Base name for all resources (e.g. dovetail)')
param appName string

@description('Azure region for all resources')
param location string = resourceGroup().location

@secure()
@description('PostgreSQL administrator password')
param postgresAdminPassword string

@secure()
@description('NEXTAUTH_SECRET — generate with: openssl rand -base64 32')
param nextAuthSecret string

// -- OAuth --

@description('OAuth provider: google or entra')
param oauthProvider string = 'google'

@secure()
@description('Google OAuth client ID (required if oauthProvider is google)')
param googleClientId string = ''

@secure()
@description('Google OAuth client secret')
param googleClientSecret string = ''

@secure()
@description('Microsoft Entra client ID (required if oauthProvider is entra)')
param entraClientId string = ''

@secure()
@description('Microsoft Entra client secret')
param entraClientSecret string = ''

@description('Microsoft Entra tenant ID')
param entraTenantId string = ''

// -- Embeddings --

@description('Embedding provider: openai or ollama')
param embeddingProvider string = 'openai'

@description('Embedding model name')
param embeddingModel string = 'text-embedding-3-small'

@secure()
@description('OpenAI API key (required if embeddingProvider is openai)')
param openaiApiKey string = ''

@description('Embedding base URL (for Ollama or custom endpoint)')
param embeddingBaseUrl string = ''

// -- RAG --

@secure()
@description('RAG API key — generate with: openssl rand -base64 32')
param ragApiKey string

// -- Container image tag --

@description('Docker image tag to deploy')
param imageTag string = 'latest'

// ============================================================
// Modules
// ============================================================

module registry 'modules/registry.bicep' = {
  name: 'registry'
  params: {
    name: replace('${appName}acr', '-', '')
    location: location
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    name: '${appName}-pg'
    location: location
    adminPassword: postgresAdminPassword
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'containerApps'
  params: {
    appName: appName
    location: location
    acrLoginServer: registry.outputs.loginServer
    acrName: registry.outputs.name
    imageTag: imageTag
    databaseUrl: 'postgres://dovetail:${postgresAdminPassword}@${postgres.outputs.fqdn}:5432/dovetail?sslmode=require'
    nextAuthSecret: nextAuthSecret
    oauthProvider: oauthProvider
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    entraClientId: entraClientId
    entraClientSecret: entraClientSecret
    entraTenantId: entraTenantId
    embeddingProvider: embeddingProvider
    embeddingModel: embeddingModel
    openaiApiKey: openaiApiKey
    embeddingBaseUrl: embeddingBaseUrl
    ragApiKey: ragApiKey
  }
}

// ============================================================
// Outputs
// ============================================================

@description('ACR login server')
output acrLoginServer string = registry.outputs.loginServer

@description('PostgreSQL FQDN')
output postgresFqdn string = postgres.outputs.fqdn

@description('API URL')
output apiUrl string = containerApps.outputs.apiUrl

@description('Web URL')
output webUrl string = containerApps.outputs.webUrl
```

- [ ] **Step 2: Write main.bicepparam**

Create `infra/main.bicepparam`:

```
using 'main.bicep'

// Required — change these before deploying
param appName = 'dovetail'
param location = 'eastus'
param postgresAdminPassword = '<CHANGE-ME: strong random password>'
param nextAuthSecret = '<CHANGE-ME: openssl rand -base64 32>'

// OAuth — fill in the provider you're using
param oauthProvider = 'google'
param googleClientId = ''
param googleClientSecret = ''
param entraClientId = ''
param entraClientSecret = ''
param entraTenantId = ''

// Embeddings (optional — leave empty to skip semantic search)
param embeddingProvider = 'openai'
param embeddingModel = 'text-embedding-3-small'
param openaiApiKey = ''
param embeddingBaseUrl = ''

// RAG API key
param ragApiKey = '<CHANGE-ME: openssl rand -base64 32>'

// Image tag (set to a specific tag for production deploys)
param imageTag = 'latest'
```

- [ ] **Step 3: Validate the full stack**

Run: `az bicep build --file infra/main.bicep`

Expected: No errors (exit code 0). Skip if `az` CLI is not installed.

- [ ] **Step 4: Commit**

```bash
git add infra/main.bicep infra/main.bicepparam
git commit -m "infra: add main Bicep orchestrator and parameter template"
```

---

## Task 7: Azure Deployment Guide (`infra/README.md`)

Write the Azure-specific deployment documentation.

**Files:**
- Create: `infra/README.md`

- [ ] **Step 1: Write infra/README.md**

Create `infra/README.md`:

```markdown
# Deploying Dovetail to Azure Container Apps

This guide walks you through deploying Dovetail to Azure using Container Apps (for the web and API servers) and Azure Database for PostgreSQL Flexible Server (for the database).

For the Docker Compose on a VM deployment path, see the [VM deployment guide](../docs/explainers/deployment-guide.md).

---

## What You'll End Up With

- **Two Container Apps** — the web frontend and the API server, each with automatic HTTPS on a `.azurecontainerapps.io` domain
- **Azure Database for PostgreSQL Flexible Server** — managed Postgres 16 with pgvector for semantic search
- **Azure Container Registry** — stores your Docker images

---

## Prerequisites

### 1. Azure Subscription

You need an active Azure subscription. If you don't have one, [create a free account](https://azure.microsoft.com/free/).

### 2. Azure CLI

Install the Azure CLI and log in:

```bash
# Install (macOS/Linux)
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Log in
az login

# Verify
az account show
```

### 3. An OAuth Application

Same as the VM deployment — you need a Google or Microsoft OAuth app. See the [OAuth setup instructions](../docs/explainers/deployment-guide.md#oauth-setup).

**Important:** When setting the redirect URI, use `https://<your-app-name>-web.<region>.azurecontainerapps.io` as the domain. You can update this after the first deploy once you know the exact FQDN.

### 4. An OpenAI API Key (Optional)

Same as the VM deployment — only needed if you want semantic search.

---

## Step 1: Create a Resource Group

```bash
az group create --name dovetail-rg --location eastus
```

Choose a region close to your users. Common options: `eastus`, `westus2`, `centralus`.

---

## Step 2: Configure Parameters

Copy the parameter template and fill in your values:

```bash
cp infra/main.bicepparam infra/main.local.bicepparam
```

Edit `infra/main.local.bicepparam` with your actual values:

- `postgresAdminPassword` — a strong random password
- `nextAuthSecret` — generate with `openssl rand -base64 32`
- OAuth credentials for your chosen provider
- `ragApiKey` — generate with `openssl rand -base64 32`
- `openaiApiKey` — your OpenAI key (if using semantic search)

**Do not commit `main.local.bicepparam`** — it contains secrets. Add it to `.gitignore` if it isn't already.

---

## Step 3: Deploy Infrastructure

```bash
az deployment group create \
  --resource-group dovetail-rg \
  --template-file infra/main.bicep \
  --parameters infra/main.local.bicepparam
```

This creates all Azure resources: the container registry, PostgreSQL server, Container Apps environment, and both container apps. The first deployment takes 5-10 minutes.

**Save the outputs** — you'll need them in the next step:

```bash
az deployment group show \
  --resource-group dovetail-rg \
  --name main \
  --query properties.outputs
```

---

## Step 4: Build and Push Images

Get the ACR login server from the deployment outputs, then build and push both images:

```bash
ACR_NAME=$(az deployment group show \
  --resource-group dovetail-rg \
  --name main \
  --query properties.outputs.acrLoginServer.value -o tsv)

# Build and push API image
az acr build --registry ${ACR_NAME%%.azurecr.io} \
  --image dovetail-api:latest \
  --file apps/api/Dockerfile .

# Build and push Web image
az acr build --registry ${ACR_NAME%%.azurecr.io} \
  --image dovetail-web:latest \
  --file apps/web/Dockerfile .
```

The Container Apps will automatically pull the new images. If they don't restart automatically, force a new revision:

```bash
az containerapp revision restart \
  --resource-group dovetail-rg \
  --name dovetail-api

az containerapp revision restart \
  --resource-group dovetail-rg \
  --name dovetail-web
```

---

## Step 5: Promote the First Admin

After the containers are running, log in via the web app URL (from the deployment outputs). Then promote yourself to admin:

```bash
az postgres flexible-server execute \
  --name dovetail-pg \
  --resource-group dovetail-rg \
  --admin-user dovetail \
  --admin-password '<your-postgres-password>' \
  --database-name dovetail \
  --querytext "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

Log out and back in for the role change to take effect.

---

## Step 6: Update OAuth Redirect URI

Now that you know the web app's FQDN, update your OAuth provider's redirect URI:

- **Google:** `https://<web-fqdn>/api/auth/callback/google`
- **Entra:** `https://<web-fqdn>/api/auth/callback/microsoft-entra-id`

---

## Step 7: Verify

1. Visit the web URL from the deployment outputs
2. Log in with your Google or Microsoft account
3. Go to `/admin` and confirm you have admin access
4. Create a category and article
5. Test search

---

## Updating

When you release a new version:

```bash
# Build and push new images
az acr build --registry <acr-name> \
  --image dovetail-api:latest \
  --file apps/api/Dockerfile .

az acr build --registry <acr-name> \
  --image dovetail-web:latest \
  --file apps/web/Dockerfile .

# Restart to pick up new images
az containerapp update --name dovetail-api --resource-group dovetail-rg \
  --image <acr-login-server>/dovetail-api:latest
az containerapp update --name dovetail-web --resource-group dovetail-rg \
  --image <acr-login-server>/dovetail-web:latest
```

Database migrations run automatically on API container startup — no manual step needed.

---

## Custom Domain (Optional)

Azure Container Apps provides automatic HTTPS on `*.azurecontainerapps.io`. To use a custom domain:

1. Add a CNAME record pointing your domain to the Container App's FQDN
2. Configure the custom domain in the Azure portal or via CLI:

```bash
az containerapp hostname add \
  --name dovetail-web \
  --resource-group dovetail-rg \
  --hostname dovetail.yourorg.com

az containerapp hostname bind \
  --name dovetail-web \
  --resource-group dovetail-rg \
  --hostname dovetail.yourorg.com \
  --environment dovetail-env \
  --validation-method CNAME
```

3. Update `NEXTAUTH_URL` to your custom domain
4. Update OAuth redirect URIs

---

## Troubleshooting

### Container Apps not starting

Check logs:

```bash
az containerapp logs show --name dovetail-api --resource-group dovetail-rg --follow
az containerapp logs show --name dovetail-web --resource-group dovetail-rg --follow
```

### Cannot connect to database

- Verify the firewall rule allows Azure services: check the Azure portal under your PostgreSQL server > Networking
- Verify `DATABASE_URL` includes `sslmode=require`
- Check that the pgvector extension is enabled: Azure portal > PostgreSQL server > Server parameters > search for `azure.extensions`

### OAuth redirect errors

- Verify the redirect URI in your OAuth provider matches the web app's FQDN exactly
- Verify `NEXTAUTH_URL` matches the web app's public URL
- Check web container logs for specific errors

### Migration timeout

If the API container fails to start because migrations take too long, the startup probe allows up to ~230 seconds (30s initial delay + 20 failures * 10s period). If you need more time (very unlikely), adjust the probe in `infra/modules/container-apps.bicep`.
```

- [ ] **Step 2: Add main.local.bicepparam to .gitignore**

Check if `.gitignore` exists and add the entry:

```
# Azure deployment secrets (local parameter overrides)
infra/*.local.bicepparam
```

- [ ] **Step 3: Commit**

```bash
git add infra/README.md .gitignore
git commit -m "docs: add Azure Container Apps deployment guide"
```

---

## Task 8: Update Root README

Add a Deployment section linking to both deployment guides.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Deployment section to README.md**

Insert the following between the "Getting Started" section (after line 66 — `See the [full deployment guide]...`) and the "How It Works" section (line 68 — `## How It Works`):

```markdown

## Deployment

Dovetail supports two deployment paths:

- **[Docker Compose on a VM](docs/explainers/deployment-guide.md)** — simplest option; everything runs in Docker on a single Linux server. Good for small teams or on-premise hosting.
- **[Azure Container Apps](infra/README.md)** — managed containers on Azure with a managed PostgreSQL database. Automatic HTTPS, scaling, and backups.

Both paths use the same Docker images. The "Getting Started" section above covers the Docker Compose quick start.

```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Deployment section to root README"
```

---

## Task 9: Final Validation

Verify that nothing is broken and all existing tests still pass.

**Files:** (none — validation only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: All tests pass across all packages.

- [ ] **Step 2: Verify Docker Compose still works**

Run: `docker compose config`

Expected: Valid compose config output with no errors. This confirms the compose file is unmodified and functional.

- [ ] **Step 3: Verify Bicep templates compile**

Run: `az bicep build --file infra/main.bicep`

Expected: No errors (exit code 0). Skip if `az` CLI is not installed.

- [ ] **Step 4: Verify no unintended changes**

Run: `git diff HEAD`

Expected: No unstaged changes. All work has been committed in previous tasks.
