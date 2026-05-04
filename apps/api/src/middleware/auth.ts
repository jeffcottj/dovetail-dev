import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { jwtDecrypt } from 'jose';
import type { NextFunction, Request, Response } from 'express';

const hkdfAsync = promisify(hkdf);

// Auth.js v5 names. Production HTTPS uses the __Secure- prefix and salts the
// HKDF key derivation with that exact cookie name; HTTP/dev uses the bare name.
const SECURE_COOKIE_NAME = '__Secure-authjs.session-token';
const COOKIE_NAME = 'authjs.session-token';

async function getDerivedKey(secret: string, salt: string): Promise<Uint8Array> {
  const buf = await hkdfAsync(
    'sha256',
    secret,
    salt,
    `Auth.js Generated Encryption Key (${salt})`,
    64,
  );
  return new Uint8Array(buf as ArrayBuffer);
}

export interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const cookies = req.cookies ?? {};
  let rawToken: string | undefined;
  let salt: string;

  if (cookies[SECURE_COOKIE_NAME]) {
    rawToken = cookies[SECURE_COOKIE_NAME];
    salt = SECURE_COOKIE_NAME;
  } else if (cookies[COOKIE_NAME]) {
    rawToken = cookies[COOKIE_NAME];
    salt = COOKIE_NAME;
  } else {
    rawToken = req.headers.authorization?.replace('Bearer ', '');
    salt = COOKIE_NAME;
  }

  if (!rawToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const secret = process.env.NEXTAUTH_SECRET ?? 'dev-secret';

  try {
    const key = await getDerivedKey(secret, salt);
    const { payload } = await jwtDecrypt(rawToken, key, { clockTolerance: 15 });
    req.user = { id: payload.sub as string, role: (payload.role as string) ?? 'viewer' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
