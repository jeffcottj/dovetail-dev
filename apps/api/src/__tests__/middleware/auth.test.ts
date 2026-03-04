import { SignJWT } from 'jose';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app.js';

const secret = new TextEncoder().encode('test-secret');

async function makeToken(payload: object) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

describe('auth middleware', () => {
  it('returns 401 with no token', async () => {
    const res = await supertest(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const token = await makeToken({ sub: 'user-1', role: 'viewer' });
    const res = await supertest(app)
      .get('/api/me')
      .set('Cookie', `next-auth.session-token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
  });
});
