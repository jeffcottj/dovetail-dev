import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { jwtDecrypt } from 'jose';
import type { NextFunction, Request, Response } from 'express';

const hkdfAsync = promisify(hkdf);

// Auth.js v5 derives the JWE encryption key using HKDF with the cookie name as salt
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
  const rawToken = req.cookies?.[COOKIE_NAME] ?? req.headers.authorization?.replace('Bearer ', '');

  if (!rawToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const secret = process.env.NEXTAUTH_SECRET ?? 'dev-secret';
  const salt = req.cookies?.[COOKIE_NAME] ? COOKIE_NAME : 'authjs.session-token';

  try {
    const key = await getDerivedKey(secret, salt);
    const { payload } = await jwtDecrypt(rawToken, key, { clockTolerance: 15 });
    req.user = { id: payload.sub as string, role: (payload.role as string) ?? 'viewer' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
