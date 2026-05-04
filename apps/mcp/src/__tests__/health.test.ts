import express from 'express';
import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createHealthHandler } from '../health.js';
import type { ApiClient } from '../api-client.js';
import type { McpConfig } from '../config.js';

const config: McpConfig = {
  apiBaseUrl: 'http://api.test',
  ragApiKey: 'abcdefgh1234',
  publicBearerToken: 'public-token',
  port: 3002,
  requestTimeoutMs: 5000,
};

function buildApp(client: ApiClient) {
  const app = express();
  app.get('/health', createHealthHandler({ config, client }));
  return app;
}

describe('health endpoint', () => {
  it('returns ok with redacted rag key', async () => {
    const client = { ping: vi.fn() } as unknown as ApiClient;
    const app = buildApp(client);
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.apiBaseUrl).toBe('http://api.test');
    expect(res.body.ragApiKey).toBe('abcd...1234');
    expect(res.body.inboundAuth).toBe('bearer');
    expect(res.body.upstreamReachable).toBeUndefined();
  });

  it('runs upstream probe when ?deep=1', async () => {
    const ping = vi.fn().mockResolvedValue(true);
    const app = buildApp({ ping } as unknown as ApiClient);
    const res = await supertest(app).get('/health?deep=1');
    expect(res.status).toBe(200);
    expect(ping).toHaveBeenCalled();
    expect(res.body.upstreamReachable).toBe(true);
  });

  it('reports upstream unreachable', async () => {
    const ping = vi.fn().mockResolvedValue(false);
    const app = buildApp({ ping } as unknown as ApiClient);
    const res = await supertest(app).get('/health?deep=true');
    expect(res.body.upstreamReachable).toBe(false);
  });
});
