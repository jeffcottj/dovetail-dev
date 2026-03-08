# Deploying Dovetail: A Step-by-Step Guide

This guide walks you through deploying Dovetail on a Linux server for the first time. It assumes you're relatively new to Linux, Docker, and server administration. Every step is explained — no prior experience required beyond being able to SSH into a server and type commands.

## What You'll End Up With

A running instance of Dovetail accessible from your browser:

- A **web application** where your team logs in with Google or Microsoft accounts
- A **REST API** that powers the web app and provides a RAG endpoint for LLM tools
- A **PostgreSQL database** that stores everything

All three run inside Docker containers, so you don't need to install Node.js, pnpm, or any programming tools on the server itself.

---

## Prerequisites

### 1. A Linux Server

You need a server running a modern Linux distribution (Ubuntu 22.04+ or Debian 12+ are good choices). This can be:

- A virtual machine from a cloud provider (AWS EC2, Azure VM, DigitalOcean Droplet, Linode, etc.)
- A physical server on your network
- A VPS from any hosting provider

**Minimum specs:** 2 CPU cores, 2 GB RAM, 20 GB disk. If you plan to use semantic search heavily, 4 GB RAM is safer.

### 2. Docker and Docker Compose

Docker packages applications into containers — self-contained units that include everything the application needs to run. Docker Compose lets you start multiple containers together with a single command.

**Install Docker** (if not already installed):

```bash
# Update your package list
sudo apt update

# Install prerequisites
sudo apt install -y ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

**Verify it works:**

```bash
docker --version
# Should print something like: Docker version 27.x.x

docker compose version
# Should print something like: Docker Compose version v2.x.x
```

**Allow your user to run Docker without `sudo`** (optional but convenient):

```bash
sudo usermod -aG docker $USER
```

Log out and back in for this to take effect. After that, you can run `docker` commands without `sudo`.

### 3. Git

Git is used to download the Dovetail source code.

```bash
sudo apt install -y git
```

### 4. An OAuth Application (Google or Microsoft)

Dovetail uses OAuth for login — users sign in with their existing Google or Microsoft account. You don't create usernames and passwords; instead, you register Dovetail with Google or Microsoft so they handle authentication for you.

You need to set one up **before** deploying. See the [OAuth Setup](#oauth-setup) section below for detailed instructions.

### 5. A Domain Name (Recommended)

While you can access Dovetail by IP address (e.g., `http://123.45.67.89:3000`), a domain name (e.g., `dovetail.yourorg.org`) is strongly recommended because:

- OAuth providers often require a real domain for callback URLs
- You'll need a domain to set up HTTPS (which you should do for production)
- It's easier for your team to remember

### 6. An OpenAI API Key (Optional)

If you want semantic search (finding articles by meaning, not just keyword matching), you'll need either:

- An **OpenAI API key** for their embedding service (costs a few cents per thousand articles), or
- A self-hosted **Ollama** server running an embedding model (free, but requires a separate setup)

Semantic search is optional. Dovetail's full-text keyword search works without it.

---

## OAuth Setup

You need to complete one of these two sections depending on which login provider your organization uses.

### Option A: Google OAuth

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth client ID**
5. If prompted, configure the **OAuth consent screen** first:
   - Choose **Internal** if you want only people in your Google Workspace organization to log in
   - Choose **External** if you want anyone with a Google account to log in (you can restrict access later inside Dovetail using roles)
   - Fill in the app name ("Dovetail") and your email
6. Back on the credentials page, create an **OAuth client ID**:
   - Application type: **Web application**
   - Name: "Dovetail" (or whatever you like)
   - Authorized redirect URIs: add `https://your-domain.com/api/auth/callback/google`
     - If testing locally first: also add `http://localhost:3000/api/auth/callback/google`

7. Google will show you a **Client ID** and **Client Secret**. Save both — you'll need them in the next section.

### Option B: Microsoft Entra ID (Azure AD)

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID > App registrations**
3. Click **New registration**
   - Name: "Dovetail"
   - Supported account types: Choose **Single tenant** if only your organization should log in
   - Redirect URI: Select **Web** and enter `https://your-domain.com/api/auth/callback/microsoft-entra-id`
     - If testing locally first: use `http://localhost:3000/api/auth/callback/microsoft-entra-id`
4. After registration, note the **Application (client) ID** and **Directory (tenant) ID** from the overview page
5. Go to **Certificates & secrets > New client secret**
   - Add a description and choose an expiry period
   - Copy the **Value** immediately (it won't be shown again)

You now have three values: **Client ID**, **Tenant ID**, and **Client Secret**.

---

## Step 1: Download the Code

Log into your server and clone the repository:

```bash
cd ~
git clone https://github.com/MarylandLegalAid/dovetail.git
cd dovetail
```

---

## Step 2: Create Your Environment File

The `.env` file tells Dovetail your database password, OAuth credentials, and other configuration. It lives in the root of the project and is never committed to git (it contains secrets).

```bash
cp .env.example .env
```

Now open it in a text editor:

```bash
nano .env
```

Here's what to change. Lines starting with `#` are comments and are ignored.

### Database Settings

```env
POSTGRES_DB=dovetail
POSTGRES_USER=dovetail
POSTGRES_PASSWORD=a-strong-random-password-here
POSTGRES_PORT=5432
DATABASE_URL=postgres://dovetail:a-strong-random-password-here@localhost:5432/dovetail
```

Change `POSTGRES_PASSWORD` to something strong and random. Update the password inside `DATABASE_URL` to match. The rest can stay as-is.

**Important:** The password in `DATABASE_URL` must exactly match `POSTGRES_PASSWORD`. If your password contains special characters like `@`, `#`, or `/`, they must be URL-encoded in the `DATABASE_URL` (e.g., `@` becomes `%40`). To avoid this hassle, stick to letters, numbers, dashes, and underscores in your password.

### Authentication Secret

```env
NEXTAUTH_SECRET=replace-this-with-a-random-string
```

Generate a strong random secret:

```bash
openssl rand -base64 32
```

Copy the output and paste it as the value of `NEXTAUTH_SECRET`. This secret is used to encrypt login session tokens. If you change it later, everyone will be logged out.

### Your Domain

```env
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

- `NEXTAUTH_URL`: The URL where users will access Dovetail (e.g., `https://dovetail.yourorg.org`)
- `NEXT_PUBLIC_API_URL`: Where the browser reaches the API. If you're using a reverse proxy that routes `/api` to the API service, set this to your domain. If you're exposing the API on a separate port, use `https://your-domain.com:3001`.

If you're just testing locally on the server, leave these as `http://localhost:3000` and `http://localhost:3001`.

### OAuth Provider

**For Google:**

```env
OAUTH_PROVIDER=google
GOOGLE_CLIENT_ID=your-client-id-from-google.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-from-google
```

**For Microsoft Entra ID:**

```env
OAUTH_PROVIDER=entra
ENTRA_CLIENT_ID=your-application-client-id
ENTRA_CLIENT_SECRET=your-client-secret-value
ENTRA_TENANT_ID=your-directory-tenant-id
```

Uncomment (remove the `#` from) the lines for your chosen provider and fill in the values you saved during OAuth setup.

### Embedding Provider (Optional)

If you want semantic search:

**For OpenAI (recommended for simplicity):**

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=sk-your-openai-api-key
```

**For Ollama (self-hosted, free):**

```env
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_BASE_URL=http://host.docker.internal:11434
```

Note: If Ollama is running on the same server, use `http://host.docker.internal:11434` (not `localhost`) because Docker containers have their own network.

If you don't want semantic search, leave these as-is. Full-text keyword search will still work.

### RAG API Key

```env
RAG_API_KEY=a-long-random-string-for-rag-access
```

This is a shared secret used to authenticate external tools (like LibreChat) that call the RAG API. Generate one:

```bash
openssl rand -base64 32
```

### Save and Exit

In nano: press `Ctrl+O` to save, then `Ctrl+X` to exit.

---

## Step 3: Build and Start

This single command builds all three Docker images and starts everything:

```bash
docker compose up --build -d
```

- `--build` tells Docker to build the images from source (required the first time and after code updates)
- `-d` runs everything in the background so you get your terminal back

**The first build will take 3-5 minutes** as it downloads base images and installs dependencies. Subsequent builds are much faster due to caching.

### Watch the Startup

To see what's happening:

```bash
docker compose logs -f
```

You should see:

1. **Postgres** starting up and passing health checks
2. **API** running database migrations ("Running database migrations... Migrations complete.") and then "Server running on port 3001"
3. **Web** starting with "Ready on http://0.0.0.0:3000"

Press `Ctrl+C` to stop watching logs (the containers keep running).

### Verify Everything Is Running

```bash
docker compose ps
```

You should see three services with status "Up":

```
NAME               STATUS
dovetail-postgres  Up (healthy)
dovetail-api       Up
dovetail-web       Up
```

If any service shows "Restarting" or "Exited", check its logs:

```bash
docker compose logs api    # or: postgres, web
```

---

## Step 4: Promote the First Admin

When you first log in, Dovetail creates your user account with the `viewer` role. Viewers can browse content but can't create or manage anything. You need to promote yourself to `admin` using a database command.

**First, log in** by visiting your Dovetail URL (e.g., `http://your-server-ip:3000`) and completing the OAuth sign-in. This creates your user record in the database.

**Then, promote yourself to admin:**

```bash
docker compose exec postgres psql -U dovetail -d dovetail -c \
  "UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';"
```

Replace `your-email@example.com` with the email address of the Google or Microsoft account you just signed in with.

You should see `UPDATE 1` confirming one row was changed. **Log out and log back in** for the role change to take effect (the role is stored in your session token, which refreshes on login).

After this, you can manage all other users' roles from the admin panel at `/admin/users` — no more database commands needed.

---

## Step 5: Set Up HTTPS (Strongly Recommended)

Running without HTTPS means login cookies and passwords travel over the network unencrypted. For anything beyond local testing, you should set up HTTPS.

The simplest approach is to put a **reverse proxy** in front of Dovetail. A reverse proxy sits between the internet and your application, handling HTTPS encryption and forwarding requests to the right container.

### Option A: Caddy (Easiest)

Caddy automatically obtains and renews HTTPS certificates from Let's Encrypt. No manual certificate management.

Install Caddy:

```bash
sudo apt install -y caddy
```

Edit the Caddy configuration:

```bash
sudo nano /etc/caddy/Caddyfile
```

Replace the contents with:

```
your-domain.com {
    # Web app
    reverse_proxy localhost:3000

    # API (if you want it accessible at the same domain)
    handle_path /api/* {
        reverse_proxy localhost:3001
    }
}
```

Replace `your-domain.com` with your actual domain. Make sure your domain's DNS A record points to your server's IP address.

Restart Caddy:

```bash
sudo systemctl restart caddy
```

Caddy will automatically obtain an HTTPS certificate. Your site will be available at `https://your-domain.com`.

**Update your `.env`** to match:

```env
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com
```

Then restart the containers:

```bash
docker compose up -d
```

### Option B: Nginx with Let's Encrypt

If you prefer nginx, install it along with certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create an nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/dovetail
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and get a certificate:

```bash
sudo ln -s /etc/nginx/sites-available/dovetail /etc/nginx/sites-enabled/
sudo nginx -t          # Test configuration
sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically modify your nginx config to add HTTPS and set up auto-renewal.

---

## Step 6: Verify Your Deployment

Walk through this checklist to confirm everything works:

1. **Visit your URL** (e.g., `https://your-domain.com`) — you should see a login page
2. **Log in** with your Google or Microsoft account
3. **Go to `/admin`** — you should see the admin dashboard (if you promoted yourself in Step 4)
4. **Create a category** — go to the home page and create a top-level category (e.g., "Housing Law")
5. **Create an article** — within the category, create and publish an article
6. **Search** — use the search bar; your article should appear in results

---

## Ongoing Operations

### Updating Dovetail

When a new version is released:

```bash
cd ~/dovetail
git pull
docker compose up --build -d
```

The API container automatically runs any new database migrations on startup, so schema changes are applied without manual intervention.

### Viewing Logs

```bash
# All services
docker compose logs -f

# One service
docker compose logs -f api
docker compose logs -f web
docker compose logs -f postgres
```

### Stopping and Starting

```bash
# Stop everything (data is preserved)
docker compose down

# Start again
docker compose up -d

# Full restart
docker compose restart
```

### Backing Up the Database

The database data lives in a Docker volume called `postgres_data`. To back it up:

```bash
# Create a SQL dump
docker compose exec postgres pg_dump -U dovetail dovetail > backup-$(date +%F).sql
```

To restore from a backup:

```bash
cat backup-2026-03-08.sql | docker compose exec -T postgres psql -U dovetail -d dovetail
```

Consider setting up a cron job to run the backup command daily:

```bash
crontab -e
```

Add this line to back up every day at 2 AM:

```
0 2 * * * cd ~/dovetail && docker compose exec -T postgres pg_dump -U dovetail dovetail > ~/backups/dovetail-$(date +\%F).sql
```

Make sure the backups directory exists: `mkdir -p ~/backups`

### Managing Users

After the initial admin promotion via SQL, you can manage all users from the web interface:

- **`/admin/users`** — view all users, change roles (viewer, editor, admin)
- **`/admin/api-keys`** — create and revoke API keys for the RAG endpoint

### Managing API Keys

API keys let external tools (like LibreChat) query your knowledge base. Create them from `/admin/api-keys`.

When you create a key, the raw key value is shown **exactly once**. Copy it immediately — it can't be retrieved later. If you lose it, revoke the old key and create a new one.

External tools use the key like this:

```
POST https://your-domain.com:3001/api/v1/rag/search
Authorization: Bearer the-api-key-you-copied
Content-Type: application/json

{"query": "eviction notice requirements"}
```

---

## Troubleshooting

### "Cannot connect" or site won't load

1. Check that containers are running: `docker compose ps`
2. Check the logs: `docker compose logs`
3. Verify the ports aren't blocked by a firewall:
   ```bash
   sudo ufw status
   # If active, allow the ports:
   sudo ufw allow 3000/tcp
   sudo ufw allow 3001/tcp
   ```

### OAuth login fails or redirects to an error

- Double-check that the redirect URI in your OAuth provider settings exactly matches your domain. For Google: `https://your-domain.com/api/auth/callback/google`. For Entra: `https://your-domain.com/api/auth/callback/microsoft-entra-id`.
- Make sure `NEXTAUTH_URL` in `.env` matches the URL you're accessing (including `https://`)
- After changing `.env`, restart the containers: `docker compose up -d`
- Check the web container logs for specific errors: `docker compose logs web`

### "DATABASE_URL is not set"

This error in the API or web logs means the `.env` file is missing the `DATABASE_URL` variable or it isn't being passed through correctly. Verify your `.env` file and restart with `docker compose up -d`.

### Migration errors on startup

If the API logs show migration errors:

- **"relation already exists"**: This usually means a previous partial migration left things in a bad state. The safest fix is to stop everything, remove the database volume, and start fresh:
  ```bash
  docker compose down -v    # -v removes volumes (DELETES ALL DATA)
  docker compose up --build -d
  ```
  Only do this if you haven't added any real content yet. If you have, reach out for help.

### Containers keep restarting

Check the logs for the restarting container:

```bash
docker compose logs api    # or web, postgres
```

Common causes:
- Wrong `DATABASE_URL` format — make sure the password matches and there are no unescaped special characters
- Missing required environment variables — compare your `.env` against `.env.example`
- Port conflict — another service is using port 3000, 3001, or 5432

### Search returns no results

- **Full-text search** works immediately — if an article is published and contains the search terms, it should appear
- **Semantic search** requires a working embedding provider. Check the API logs for embedding errors. If using OpenAI, verify your API key is valid and has credits.

### Performance is slow

- Increase server RAM to 4 GB if you're running on 2 GB
- The first request after startup is always slower (cold start). Subsequent requests should be fast.
- If the database grows large, consider adding indexes — but this is unlikely to be needed for typical knowledge base usage

---

## Architecture Overview

For reference, here's how the pieces fit together:

```
Internet
   │
   ▼
Reverse Proxy (Caddy/nginx)    ← handles HTTPS
   │
   ├──► Web container (:3000)  ← serves pages, handles login
   │         │
   │         ▼
   └──► API container (:3001)  ← REST API, search, RAG
              │
              ▼
         PostgreSQL (:5432)    ← stores everything
              with pgvector      (articles, users, embeddings)
```

The web container talks to the API container over Docker's internal network (not through the reverse proxy). Users only interact with the web container directly. The API is also exposed for the RAG endpoint used by external tools.
