import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { EncryptJWT } from 'jose';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app.js';

const hkdfAsync = promisify(hkdf);

const TEST_SECRET = 'test-secret';
const COOKIE_NAME = 'authjs.session-token';

async function getDerivedKey(secret: string, salt: string): Promise<Uint8Array> {
  const buf = await hkdfAsync('sha256', secret, salt, `Auth.js Generated Encryption Key (${salt})`, 64);
  return new Uint8Array(buf as ArrayBuffer);
}

async function makeToken(payload: object) {
  const key = await getDerivedKey(TEST_SECRET, COOKIE_NAME);
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
    .setExpirationTime('1h')
    .encrypt(key);
}

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
