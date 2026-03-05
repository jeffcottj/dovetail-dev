import { jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? 'dev-secret');

export interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.['next-auth.session-token']
    ?? req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    req.user = { id: payload.sub as string, role: (payload.role as string) ?? 'viewer' };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
