'use client';

import { useSession } from 'next-auth/react';
import type { Role } from '@dovetail/types';
import { hasMinimumRole } from '@/lib/roles';

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  isEditor: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useCurrentUser(): UseCurrentUserResult {
  const { data: session, status } = useSession();

  const user: CurrentUser | null = session?.user
    ? {
        id: session.user.id ?? '',
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        image: session.user.image ?? null,
        role: (session.user.role as Role) ?? 'viewer',
      }
    : null;

  const role = user?.role ?? 'viewer';

  return {
    user,
    isEditor: hasMinimumRole(role, 'editor'),
    isAdmin: hasMinimumRole(role, 'admin'),
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
  };
}
