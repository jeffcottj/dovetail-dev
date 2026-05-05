# Integrating Dovetail with LibreChat

LibreChat connects to Dovetail through the **Dovetail MCP server** (`apps/mcp`), which exposes Dovetail's knowledge bases as a set of read-only Model Context Protocol tools. This is the supported integration for LibreChat.

For raw HTTP-only clients (without MCP support), the underlying REST endpoints are documented in [`docs/integrations/rag-api.md`](./rag-api.md).

## How auth works

There is **one** secret per LibreChat agent: a Dovetail admin-issued API key. LibreChat presents it as the bearer on every `/mcp` request, the MCP server forwards it verbatim to the RAG API, and per-KB scoping is enforced by Dovetail against the `api_keys` table on every call.

If you want different LibreChat agents to talk to different KBs, issue a separate Dovetail API key per agent and scope each to the KB(s) it should reach.

## Prerequisites

- A running Dovetail instance, with `api`, `web`, `mcp`, and `postgres` services up.
- Admin access to Dovetail (for creating API keys).
- A LibreChat instance with MCP server support.

## Step 1: Create a Dovetail API key per agent

1. Sign in to Dovetail as a global admin.
2. Open **Admin → API Keys**.
3. Click **Create API Key**, name it after the agent (e.g. "LibreChat – Tenant Help"), and **scope it to the KBs that agent should access**.
4. Copy the key immediately — it is shown only once.
5. Store it in your secrets manager. This is the value LibreChat will send as `Authorization: Bearer …` on `/mcp` requests.

Repeat for each LibreChat agent that should target a different KB scope.

## Step 2: Run the Dovetail MCP server

The MCP server ships as a Compose service. In the same directory as `docker-compose.yml`:

```bash
docker compose up -d mcp
```

The MCP server itself owns no secrets — there is nothing to set in `.env` for it beyond `MCP_API_BASE_URL` (already pre-set in Compose).

Confirm it is healthy:

```bash
docker compose ps mcp
curl http://localhost:3002/health
curl 'http://localhost:3002/health?deep=1'
```

`?deep=1` calls the API's own `/health` and reports whether the upstream is reachable. It does not exercise an API key — auth is per-request and per-agent.

Configuration variables are documented in [`docs/integrations/mcp.md`](./mcp.md).

## Step 3: Point LibreChat at the MCP server

Add the Dovetail MCP server to your LibreChat configuration. The exact YAML/JSON shape depends on your LibreChat version — check the [LibreChat MCP docs](https://www.librechat.ai/) for the current schema. The values you need:

| Setting | Value |
|---|---|
| Transport | `streamable-http` (also called "HTTP" or "Streamable HTTP") |
| URL | `http://<mcp-host>:3002/mcp` (Compose) or `https://<dovetail-domain>/mcp` (production) |
| Auth | `Authorization: Bearer <Dovetail API key from Step 1>` |

A representative `librechat.yaml` snippet, with one MCP server entry per agent:

```yaml
mcpServers:
  dovetail-tenant:
    type: streamable-http
    url: https://dovetail.example.com/mcp
    headers:
      Authorization: "Bearer ${DOVETAIL_TENANT_KB_KEY}"
  dovetail-eviction:
    type: streamable-http
    url: https://dovetail.example.com/mcp
    headers:
      Authorization: "Bearer ${DOVETAIL_EVICTION_KB_KEY}"
```

When LibreChat is on the same Docker Compose network as Dovetail, swap the URL for `http://mcp:3002/mcp`. The bearer header is still required.

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
| LibreChat sees `401` connecting to `/mcp` | Bearer header missing, or API key revoked / typo | Confirm the `Authorization` header is set; recreate the key in Dovetail admin if needed. |
| All tools return `unauthorized` | The presented key is invalid or revoked | Issue a new key in Dovetail admin and update the LibreChat config. |
| Tools return `forbidden` for some KBs | Key not scoped to that KB | Edit the API key in Dovetail admin to add that KB. |
| `list_knowledge_bases` returns `[]` | Key has no KBs attached | Attach KBs via the admin UI. |
| LibreChat does not see the MCP server | URL/port wrong, or LibreChat not on the network | Verify with `curl http://<mcp-host>:3002/health`. |
| Drafts/archived articles never appear | Working as intended | Only published articles are exposed. |
| `network` errors in MCP logs | API not reachable from MCP container | Check Compose `depends_on`/networking and that `MCP_API_BASE_URL` resolves from the MCP container. |

## Rotating keys

Per agent, treat the Dovetail API key as the only credential to rotate:

1. In Dovetail admin, create a new API key with the same KB scope.
2. Update the LibreChat config for that agent to use the new key and reload LibreChat.
3. Revoke the old key in Dovetail admin.

Other agents are unaffected — each has its own key.

## Direct REST integration (legacy)

If you need to integrate a client that does not speak MCP, see [`docs/integrations/rag-api.md`](./rag-api.md). LibreChat itself should use the MCP integration described above.
