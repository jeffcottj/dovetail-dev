import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    checkDatabaseConnection: vi.fn(),
  };
});

import { app } from '../app.js';
import { checkDatabaseConnection } from '@dovetail/db';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const response = await supertest(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('returns 200 when the database is reachable', async () => {
    vi.mocked(checkDatabaseConnection).mockResolvedValue(true);

    const response = await supertest(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      checks: { database: true },
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    vi.mocked(checkDatabaseConnection).mockResolvedValue(false);

    const response = await supertest(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      checks: { database: false },
    });
  });
});
