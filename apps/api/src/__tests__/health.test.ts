import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../app.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const response = await supertest(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
