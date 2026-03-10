import type { ReactNode } from 'react';
import type { Role } from '@dovetail/types';
import { auth } from '@/auth';
import { hasMinimumRole } from '@/lib/roles';

interface RoleGateProps {
  minimumRole: Role;
  children: ReactNode;
  fallback?: ReactNode;
}

export async function RoleGate({ minimumRole, children, fallback = null }: RoleGateProps) {
  const session = await auth();
  const userRole = (session?.user?.role as Role) ?? 'viewer';

  if (!hasMinimumRole(userRole, minimumRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
