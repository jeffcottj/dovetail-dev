import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app.js';
import { COOKIE_NAME, SECURE_COOKIE_NAME, makeToken, TEST_SECRET } from '../helpers/token.js';

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

  it('returns 200 with valid __Secure- cookie (production HTTPS)', async () => {
    process.env.NEXTAUTH_SECRET = TEST_SECRET;
    const token = await makeToken({ sub: 'user-2', role: 'editor' }, { salt: SECURE_COOKIE_NAME });
    const res = await supertest(app)
      .get('/api/me')
      .set('Cookie', `${SECURE_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-2');
  });

  it('returns 401 when token salt does not match cookie name', async () => {
    process.env.NEXTAUTH_SECRET = TEST_SECRET;
    // Token salted with the bare cookie name but sent under the __Secure- name.
    const mismatched = await makeToken({ sub: 'user-3' }, { salt: COOKIE_NAME });
    const res = await supertest(app)
      .get('/api/me')
      .set('Cookie', `${SECURE_COOKIE_NAME}=${mismatched}`);
    expect(res.status).toBe(401);
  });

  it('prefers __Secure- cookie when both are present', async () => {
    process.env.NEXTAUTH_SECRET = TEST_SECRET;
    const secureToken = await makeToken({ sub: 'user-secure' }, { salt: SECURE_COOKIE_NAME });
    const bareToken = await makeToken({ sub: 'user-bare' }, { salt: COOKIE_NAME });
    const res = await supertest(app)
      .get('/api/me')
      .set('Cookie', `${SECURE_COOKIE_NAME}=${secureToken}; ${COOKIE_NAME}=${bareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-secure');
  });
});
