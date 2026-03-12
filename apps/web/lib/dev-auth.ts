import type { Role } from '@dovetail/types';
import { encode } from 'next-auth/jwt';

export const DEV_AUTH_COOKIE_NAME = 'authjs.session-token';

export const DEV_USERS = {
  admin: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@local.dovetail.test',
    name: 'Local Admin',
    role: 'admin' as Role,
  },
  editor: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'editor@local.dovetail.test',
    name: 'Local Editor',
    role: 'editor' as Role,
  },
  viewer: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'viewer@local.dovetail.test',
    name: 'Local Viewer',
    role: 'viewer' as Role,
  },
} as const;

export type DevUserKey = keyof typeof DEV_USERS;

export function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_ENABLED === 'true';
}

export function getDevUser(userKey: string) {
  if (!(userKey in DEV_USERS)) return null;
  return DEV_USERS[userKey as DevUserKey];
}

export async function createDevSessionToken(userKey: DevUserKey) {
  const user = DEV_USERS[userKey];
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error('NEXTAUTH_SECRET must be set when DEV_AUTH_ENABLED=true');
  }

  return encode({
    secret,
    salt: DEV_AUTH_COOKIE_NAME,
    token: {
      sub: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
