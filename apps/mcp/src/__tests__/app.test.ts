import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { McpConfig } from '../config.js';

const config: McpConfig = {
  apiBaseUrl: 'http://api.test',
  port: 3002,
  requestTimeoutMs: 5000,
};

const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('mcp inbound bearer auth', () => {
  it('rejects /mcp POST without Authorization header', async () => {
    const app = createApp({ config });
    const res = await supertest(app).post('/mcp').send(initRequest);
    expect(res.status).toBe(401);
  });

  it('rejects /mcp POST with non-Bearer scheme', async () => {
    const app = createApp({ config });
    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Basic Zm9vOmJhcg==')
      .send(initRequest);
    expect(res.status).toBe(401);
  });

  it('rejects /mcp POST with empty Bearer value', async () => {
    const app = createApp({ config });
    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer ')
      .send(initRequest);
    expect(res.status).toBe(401);
  });

  it('rejects /mcp GET without Authorization header', async () => {
    const app = createApp({ config });
    const res = await supertest(app).get('/mcp');
    expect(res.status).toBe(401);
  });

  it('rejects /mcp DELETE without Authorization header', async () => {
    const app = createApp({ config });
    const res = await supertest(app).delete('/mcp');
    expect(res.status).toBe(401);
  });

  it('leaves /health unauthenticated', async () => {
    const app = createApp({ config });
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('accepts any Bearer value at the MCP layer (validation is downstream)', async () => {
    const app = createApp({ config });
    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer arbitrary-token')
      .set('Accept', 'application/json, text/event-stream')
      .send(initRequest);
    // The auth middleware accepted; transport may respond with 200 (event-stream) or another non-401 status.
    expect(res.status).not.toBe(401);
  });
});

describe('mcp session token binding', () => {
  async function initSession(app: ReturnType<typeof createApp>, token: string) {
    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send(initRequest);
    expect(res.status).not.toBe(401);
    const sessionId = res.headers['mcp-session-id'];
    expect(sessionId).toBeTruthy();
    return sessionId as string;
  }

  it('rejects session reuse with a different bearer token', async () => {
    const app = createApp({ config });
    const sessionId = await initSession(app, 'token-a');

    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer token-b')
      .set('mcp-session-id', sessionId)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown mcp-session-id', async () => {
    const app = createApp({ config });
    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer token-a')
      .set('mcp-session-id', '00000000-0000-0000-0000-000000000000')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.status).toBe(404);
  });
});

describe('mcp upstream client wiring', () => {
  it('forwards the session bearer token verbatim to the upstream RAG API', async () => {
    // First call: list_knowledge_bases registration probe? No — the SDK does its own
    // initialize handshake. We trigger the upstream call by invoking tools/call → list_knowledge_bases.
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ id: 'kb-1', name: 'KB', slug: 'kb' }]));

    const app = createApp({ config, fetcher: fetcher as unknown as typeof fetch });

    // initialize
    const initRes = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer my-agent-key')
      .set('Accept', 'application/json, text/event-stream')
      .send(initRequest);
    const sessionId = initRes.headers['mcp-session-id'] as string;
    expect(sessionId).toBeTruthy();

    // notifications/initialized — required by the SDK before tool calls
    await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer my-agent-key')
      .set('mcp-session-id', sessionId)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    // tools/call → list_knowledge_bases (no input)
    await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer my-agent-key')
      .set('mcp-session-id', sessionId)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: { name: 'list_knowledge_bases', arguments: {} },
      });

    expect(fetcher).toHaveBeenCalled();
    const upstreamCall = (fetcher as any).mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('/api/v1/rag/knowledge-bases'),
    );
    expect(upstreamCall, 'expected an upstream call to /api/v1/rag/knowledge-bases').toBeTruthy();
    expect(upstreamCall[1].headers.Authorization).toBe('Bearer my-agent-key');
  });
});
