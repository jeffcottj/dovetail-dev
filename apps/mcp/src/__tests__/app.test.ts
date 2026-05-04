import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { McpConfig } from '../config.js';

const config: McpConfig = {
  apiBaseUrl: 'http://api.test',
  ragApiKey: 'rag-key',
  publicBearerToken: 'public-token',
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

describe('mcp inbound bearer auth', () => {
  it('rejects /mcp POST without Authorization header', async () => {
    const app = createApp({ config });
    const res = await supertest(app).post('/mcp').send(initRequest);
    expect(res.status).toBe(401);
  });

  it('rejects /mcp POST with wrong bearer token', async () => {
    const app = createApp({ config });
    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer wrong-token')
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

  it('passes auth check with correct bearer (initialize succeeds)', async () => {
    const app = createApp({ config });
    const res = await supertest(app)
      .post('/mcp')
      .set('Authorization', 'Bearer public-token')
      .set('Accept', 'application/json, text/event-stream')
      .send(initRequest);
    // The auth middleware accepted; downstream the MCP transport may
    // respond with 200 (event-stream) or another non-401 status.
    expect(res.status).not.toBe(401);
  });
});
