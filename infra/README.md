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

**Do not commit `main.local.bicepparam`** — it contains secrets. It is already covered by `.gitignore`.

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
ACR_LOGIN_SERVER=$(az deployment group show \
  --resource-group dovetail-rg \
  --name main \
  --query properties.outputs.acrLoginServer.value -o tsv)

ACR_NAME="${ACR_LOGIN_SERVER%%.azurecr.io}"

# Build and push API image
az acr build --registry "$ACR_NAME" \
  --image dovetail-api:latest \
  --file apps/api/Dockerfile .

# Build and push Web image
az acr build --registry "$ACR_NAME" \
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
az acr build --registry "$ACR_NAME" \
  --image dovetail-api:latest \
  --file apps/api/Dockerfile .

az acr build --registry "$ACR_NAME" \
  --image dovetail-web:latest \
  --file apps/web/Dockerfile .

# Restart to pick up new images
az containerapp update --name dovetail-api --resource-group dovetail-rg \
  --image "$ACR_LOGIN_SERVER/dovetail-api:latest"
az containerapp update --name dovetail-web --resource-group dovetail-rg \
  --image "$ACR_LOGIN_SERVER/dovetail-web:latest"
```

Database migrations run automatically on API container startup — no manual step needed.

---

## Custom Domain (Optional)

Azure Container Apps provides automatic HTTPS on `*.azurecontainerapps.io`. To use a custom domain:

1. Add a CNAME record pointing your domain to the Container App's FQDN
2. Configure the custom domain via CLI:

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

3. Update `NEXTAUTH_URL` on the web container app to your custom domain
4. Update OAuth redirect URIs in your provider's console

---

## Troubleshooting

### Container Apps not starting

Check logs:

```bash
az containerapp logs show --name dovetail-api --resource-group dovetail-rg --follow
az containerapp logs show --name dovetail-web --resource-group dovetail-rg --follow
```

### Cannot connect to database

- Verify the firewall rule allows Azure services: Azure portal > PostgreSQL server > Networking
- Verify `DATABASE_URL` includes `sslmode=require`
- Check that the pgvector extension is enabled: Azure portal > PostgreSQL server > Server parameters > search for `azure.extensions`

### OAuth redirect errors

- Verify the redirect URI in your OAuth provider matches the web app's FQDN exactly
- Verify `NEXTAUTH_URL` matches the web app's public URL
- Check web container logs for specific errors

### Migration timeout

The API startup probe allows up to ~230 seconds (30s initial delay + 20 failures × 10s period). If migrations take longer (very unlikely), increase `failureThreshold` in `infra/modules/container-apps.bicep` and redeploy.
