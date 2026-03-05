import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { COOKIE_NAME, makeToken, TEST_SECRET } from '../helpers/token.js';

describe('auth middleware', () => {
  it('returns 401 with no token', async () => {
    const res = await supertest(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    process.env.NEXTAUTH_SECRET = TEST_SECRET;
    const token = await makeToken({ sub: 'user-1', role: 'viewer' });
    const res = await supertest(app)
      .get('/api/me')
      .set('Cookie', `${COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
  });
});
