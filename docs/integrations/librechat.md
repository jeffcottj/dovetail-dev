# Integrating Dovetail with LibreChat

LibreChat connects to Dovetail through the **Dovetail MCP server** (`apps/mcp`), which exposes Dovetail's knowledge bases as a set of read-only Model Context Protocol tools. This is the supported integration for LibreChat.

For raw HTTP-only clients (without MCP support), the underlying REST endpoints are documented in [`docs/integrations/rag-api.md`](./rag-api.md).

## Prerequisites

- A running Dovetail instance, with `api`, `web`, `mcp`, and `postgres` services up.
- Admin access to Dovetail (for creating an API key).
- A LibreChat instance with MCP server support.

## Step 1: Create a Dovetail API key (upstream)

1. Sign in to Dovetail as a global admin.
2. Open **Admin → API Keys**.
3. Click **Create API Key**, name it (e.g. "LibreChat Production"), and **scope it to the KBs you want LibreChat to access**.
4. Copy the key immediately — it is shown only once.
5. Store it in your secrets manager — this is `DOVETAIL_RAG_API_KEY`, used by the MCP server to call the Dovetail RAG API.

The KBs you select here define the entire LibreChat scope. The MCP server has no separate scope configuration.

## Step 2: Generate the public MCP bearer token (inbound)

LibreChat must present a separate bearer token on every `/mcp` request. The MCP service enforces it.

```bash
openssl rand -base64 32
```

Store that value as `MCP_PUBLIC_BEARER_TOKEN` in the Dovetail `.env` and share it with the LibreChat operator. Rotating it does not require a new Dovetail API key.

## Step 3: Run the Dovetail MCP server

The MCP server ships as a Compose service. In the same directory as `docker-compose.yml`:

```bash
export DOVETAIL_RAG_API_KEY=<the-key-from-step-1>
export MCP_PUBLIC_BEARER_TOKEN=<the-token-from-step-2>
docker compose up -d mcp
```

Confirm it is healthy:

```bash
docker compose ps mcp
curl http://localhost:3002/health
curl 'http://localhost:3002/health?deep=1'
```

`?deep=1` calls the upstream API once and reports whether `DOVETAIL_RAG_API_KEY` authenticates correctly.

Configuration variables are documented in [`docs/integrations/mcp.md`](./mcp.md).

## Step 4: Point LibreChat at the MCP server

Add the Dovetail MCP server to your LibreChat configuration. The exact YAML/JSON shape depends on your LibreChat version — check the [LibreChat MCP docs](https://www.librechat.ai/) for the current schema. The values you need:

| Setting | Value |
|---|---|
| Transport | `streamable-http` (also called "HTTP" or "Streamable HTTP") |
| URL | `http://<mcp-host>:3002/mcp` (Compose) or `https://<dovetail-domain>/mcp` (production) |
| Auth | `Authorization: Bearer $MCP_PUBLIC_BEARER_TOKEN` |

A representative `librechat.yaml` snippet:

```yaml
mcpServers:
  dovetail:
    type: streamable-http
    url: https://dovetail.example.com/mcp
    headers:
      Authorization: "Bearer ${MCP_PUBLIC_BEARER_TOKEN}"
```

When LibreChat is on the same Docker Compose network as Dovetail, swap the URL for `http://mcp:3002/mcp`. The bearer header is still required.

## Step 5: Verify the tools appear

After restarting LibreChat, the following six tools should be available to assistants:

- `list_knowledge_bases`
- `list_categories`
- `search_articles`
- `get_article`
- `get_article_citations`
- `suggest_related_articles`

Quick smoke test from inside a LibreChat conversation:

> *Use `list_knowledge_bases` to show me which KBs are available.*

Then:

> *Use `search_articles` to find the top 3 articles about security deposits, citing sources via `get_article_citations`.*

If the tools are missing or always error, check the MCP server logs (`docker compose logs -f mcp`) for upstream auth or scope errors.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| LibreChat sees `401` connecting to `/mcp` | `MCP_PUBLIC_BEARER_TOKEN` mismatch between Dovetail and the LibreChat config | Resync the token; restart `mcp` if changed in `.env`. |
| All tools return `unauthorized` | `DOVETAIL_RAG_API_KEY` missing, revoked, or wrong | Recreate the upstream key in Dovetail admin and restart `mcp`. |
| Tools return `forbidden` for some KBs | Upstream key not scoped to that KB | Edit the API key in Dovetail admin to add that KB. |
| `list_knowledge_bases` returns `[]` | Upstream key has no KBs attached | Attach KBs via the admin UI. |
| LibreChat does not see the MCP server | URL/port wrong, or LibreChat not on the network | Verify with `curl http://<mcp-host>:3002/health`. |
| Drafts/archived articles never appear | Working as intended | Only published articles are exposed. |
| `network` errors in MCP logs | API not reachable from MCP container | Check Compose `depends_on`/networking and that `MCP_API_BASE_URL` resolves from the MCP container. |

## Rotating tokens

**Rotating the upstream Dovetail API key (`DOVETAIL_RAG_API_KEY`):**

1. Create a new API key in Dovetail admin with the same KB scope.
2. Update the `DOVETAIL_RAG_API_KEY` secret.
3. `docker compose up -d mcp` to restart the MCP service with the new key.
4. Revoke the old key in Dovetail admin.

**Rotating the public MCP bearer (`MCP_PUBLIC_BEARER_TOKEN`):**

1. Generate a new random secret (`openssl rand -base64 32`).
2. Update the secret on both sides — Dovetail `.env` and LibreChat config — at the same time.
3. `docker compose up -d mcp` and restart LibreChat. Until both restart with the new value, expect `401` on `/mcp`.

## Direct REST integration (legacy)

If you need to integrate a client that does not speak MCP, see [`docs/integrations/rag-api.md`](./rag-api.md). LibreChat itself should use the MCP integration described above.
