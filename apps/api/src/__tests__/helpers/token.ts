import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { EncryptJWT } from 'jose';

const hkdfAsync = promisify(hkdf);

export const TEST_SECRET = 'test-secret';
export const COOKIE_NAME = 'authjs.session-token';
export const SECURE_COOKIE_NAME = '__Secure-authjs.session-token';

async function getDerivedKey(secret: string, salt: string): Promise<Uint8Array> {
  const buf = await hkdfAsync('sha256', secret, salt, `Auth.js Generated Encryption Key (${salt})`, 64);
  return new Uint8Array(buf as ArrayBuffer);
}

export async function makeToken(
  payload: Record<string, unknown>,
  options: { salt?: string } = {},
) {
  const salt = options.salt ?? COOKIE_NAME;
  const key = await getDerivedKey(TEST_SECRET, salt);
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256CBC-HS512' })
    .setExpirationTime('1h')
    .encrypt(key);
}
