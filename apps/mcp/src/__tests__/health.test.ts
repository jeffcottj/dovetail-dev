import express from 'express';
import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createHealthHandler } from '../health.js';
import type { McpConfig } from '../config.js';

const config: McpConfig = {
  apiBaseUrl: 'http://api.test',
  port: 3002,
  requestTimeoutMs: 5000,
};

function buildApp(fetcher?: typeof fetch) {
  const app = express();
  app.get('/health', createHealthHandler({ config, fetcher }));
  return app;
}

describe('health endpoint', () => {
  it('returns ok without exposing secrets', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.apiBaseUrl).toBe('http://api.test');
    expect(res.body.inboundAuth).toBe('bearer');
    expect(res.body.upstreamReachable).toBeUndefined();
    expect(res.body).not.toHaveProperty('ragApiKey');
  });

  it('reports upstream reachable when ?deep=1 and API /health responds 200', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const app = buildApp(fetcher as unknown as typeof fetch);
    const res = await supertest(app).get('/health?deep=1');
    expect(res.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith('http://api.test/health', expect.objectContaining({ method: 'GET' }));
    expect(res.body.upstreamReachable).toBe(true);
  });

  it('reports upstream unreachable when API /health is unreachable', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const app = buildApp(fetcher as unknown as typeof fetch);
    const res = await supertest(app).get('/health?deep=true');
    expect(res.body.upstreamReachable).toBe(false);
  });

  it('reports upstream unreachable when API /health returns non-2xx', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const app = buildApp(fetcher as unknown as typeof fetch);
    const res = await supertest(app).get('/health?deep=1');
    expect(res.body.upstreamReachable).toBe(false);
  });
});
