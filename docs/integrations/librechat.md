# Integrating Dovetail with LibreChat

LibreChat connects to Dovetail through the **Dovetail MCP server** (`apps/mcp`), which exposes Dovetail's knowledge bases as a set of read-only Model Context Protocol tools. This is the supported integration for LibreChat.

For raw HTTP-only clients (without MCP support), the underlying REST endpoints are documented in [`docs/integrations/rag-api.md`](./rag-api.md).

## Prerequisites

- A running Dovetail instance, with `api`, `web`, `mcp`, and `postgres` services up.
- Admin access to Dovetail (for creating an API key).
- A LibreChat instance with MCP server support.

## Step 1: Create a Dovetail API key

1. Sign in to Dovetail as a global admin.
2. Open **Admin → API Keys**.
3. Click **Create API Key**, name it (e.g. "LibreChat Production"), and **scope it to the KBs you want LibreChat to access**.
4. Copy the key immediately — it is shown only once.
5. Store it in your secrets manager.

The KBs you select here define the entire LibreChat scope. The MCP server has no separate scope configuration.

## Step 2: Run the Dovetail MCP server

The MCP server ships as a Compose service. In the same directory as `docker-compose.yml`:

```bash
export MCP_API_KEY=<the-key-from-step-1>
docker compose up -d mcp
```

Confirm it is healthy:

```bash
docker compose ps mcp
curl http://localhost:3002/health
curl 'http://localhost:3002/health?deep=1'
```

`?deep=1` calls the upstream API once and reports whether the key authenticates correctly.

Configuration variables are documented in [`docs/integrations/mcp.md`](./mcp.md).

## Step 3: Point LibreChat at the MCP server

Add the Dovetail MCP server to your LibreChat configuration. The exact YAML/JSON shape depends on your LibreChat version — check the [LibreChat MCP docs](https://www.librechat.ai/) for the current schema. The values you need:

| Setting | Value |
|---|---|
| Transport | `streamable-http` (also called "HTTP" or "Streamable HTTP") |
| URL | `http://<mcp-host>:3002/mcp` |
| Auth | none — the MCP server holds the Dovetail API key internally |

A representative `librechat.yaml` snippet:

```yaml
mcpServers:
  dovetail:
    type: streamable-http
    url: http://mcp:3002/mcp
```

When LibreChat is on the same Docker Compose network as Dovetail, use `http://mcp:3002/mcp`. Otherwise use the public URL fronted by your reverse proxy.

## Step 4: Verify the tools appear

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
| All tools return `unauthorized` | `MCP_API_KEY` missing, revoked, or wrong | Recreate the key in Dovetail admin and restart `mcp`. |
| Tools return `forbidden` for some KBs | Key not scoped to that KB | Edit the API key in Dovetail admin to add that KB. |
| `list_knowledge_bases` returns `[]` | Key has no KBs attached | Attach KBs via the admin UI. |
| LibreChat does not see the MCP server | URL/port wrong, or LibreChat not on the network | Verify with `curl http://<mcp-host>:3002/health`. |
| Drafts/archived articles never appear | Working as intended | Only published articles are exposed. |
| `network` errors in MCP logs | API not reachable from MCP container | Check Compose `depends_on`/networking and that `MCP_API_BASE_URL` resolves from the MCP container. |

## Rotating the API key

1. Create a new API key in Dovetail admin with the same KB scope.
2. Update the `MCP_API_KEY` secret.
3. `docker compose up -d mcp` to restart the MCP service with the new key.
4. Revoke the old key in Dovetail admin.

## Direct REST integration (legacy)

If you need to integrate a client that does not speak MCP, see [`docs/integrations/rag-api.md`](./rag-api.md). LibreChat itself should use the MCP integration described above.
