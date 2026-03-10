'use client';

import type { ReactNode } from 'react';
import type { Role } from '@dovetail/types';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { hasMinimumRole } from '@/lib/roles';

interface RoleGateClientProps {
  minimumRole: Role;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGateClient({ minimumRole, children, fallback = null }: RoleGateClientProps) {
  const { user, isLoading } = useCurrentUser();

  if (isLoading) return null;

  const userRole = user?.role ?? 'viewer';

  if (!hasMinimumRole(userRole, minimumRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
