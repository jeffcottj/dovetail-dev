import Link from 'next/link';
import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../../components/ui/Card';
import { Badge } from '../../../../../components/ui/Badge';
import { buildGlobalAdminActions, getAdminNavSections } from '../../../../../lib/admin/nav';
import { buildGlobalAdminMetrics, fetchGlobalAdminOverview } from '../../../../../lib/admin/workspace';
import { apiFetch } from '../../../../../lib/api';
import { CategoryRoleManager } from '../../../../(main)/admin/users/[id]/CategoryRoleManager';
import type { UserCategoryRole } from '@dovetail/types';

interface UserData {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  provider: string;
  createdAt: string;
}

interface PaginatedUsers {
  data: UserData[];
  total: number;
  page: number;
  limit: number;
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const { id } = await params;

  let user: UserData | null = null;
  try {
    const result = await apiFetch<PaginatedUsers>('/api/admin/users?limit=100');
    user = result.data.find((candidate) => candidate.id === id) ?? null;
  } catch {
    // API unavailable
  }

  if (!user) {
    redirect('/admin/users');
  }

  let categoryRoles: UserCategoryRole[] = [];
  try {
    const result = await apiFetch<{ categoryRoles: UserCategoryRole[] }>(
      `/api/admin/users/${id}/category-roles`,
    );
    categoryRoles = result.categoryRoles;
  } catch {
    // API unavailable
  }

  const roleBadgeVariant =
    user.role === 'admin' ? 'archived' : user.role === 'editor' ? 'info' : 'draft';

  return (
    <AdminWorkspaceLayout
      nav={{ sections: getAdminNavSections({ pathname: '/admin/users' }) }}
      header={{
        title: user.name,
        description: 'Review global access and category-level overrides for this user.',
        scopeLabel: 'Global Admin',
      }}
      metrics={buildGlobalAdminMetrics(overview)}
      actions={buildGlobalAdminActions()}
      activity={overview.activity}
    >
      <section className="space-y-6">
        <Link href="/admin/users" className="text-sm text-accent hover:underline font-[family-name:var(--font-ui)]">
          &larr; Back to Users
        </Link>

        <Card className="!bg-[color:var(--color-admin-panel)]">
          <div className="flex items-start gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-16 w-16 rounded-full border border-border-light"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-light bg-parchment-warm text-xl font-[family-name:var(--font-display)] text-ink-muted">
                {user.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
                Account Details
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-ink">
                {user.name}
              </h2>
              <p className="mt-1 text-sm text-ink-light">{user.email}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={roleBadgeVariant}>{user.role}</Badge>
                <span className="text-xs capitalize text-ink-muted font-[family-name:var(--font-ui)]">
                  via {user.provider}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <section className="space-y-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
              Category Role Overrides
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-light font-[family-name:var(--font-ui)]">
              Override this user&apos;s global role for specific categories. The most specific role
              wins when accessing content in a category.
            </p>
          </div>
          <CategoryRoleManager userId={id} initialCategoryRoles={categoryRoles} />
        </section>
      </section>
    </AdminWorkspaceLayout>
  );
}
