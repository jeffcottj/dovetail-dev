import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../components/ui/Card';
import { buildGlobalAdminActions, getAdminNavSections } from '../../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../../lib/admin/workspace';
import { apiFetch } from '../../../../lib/api';
import { UserList } from '../../../(main)/admin/users/UserList';

interface PaginatedUsers {
  data: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: string;
    provider: string;
    createdAt: string;
  }[];
  total: number;
  page: number;
  limit: number;
}

export default async function AdminUsersPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);

  let users: PaginatedUsers = { data: [], total: 0, page: 1, limit: 20 };
  let error: string | null = null;
  try {
    users = await apiFetch<PaginatedUsers>('/api/admin/users?limit=100');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load users';
  }

  return (
    <AdminWorkspaceLayout
      nav={{ sections: getAdminNavSections({ pathname: '/admin/users' }) }}
      header={{
        title: 'Users',
        description: 'View all users, change global roles, and assign category-level permissions.',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
      actions={buildGlobalAdminActions()}
      activity={overview.ok ? overview.activity : []}
    >
      <section className="space-y-4">
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            User Directory
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            Review the current account list, update global roles, and click into a user to manage
            category-level overrides.
          </p>
        </Card>
        {overviewWarning ? (
          <Card className="border-warning/40 bg-warning/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
              Overview unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
          </Card>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger font-[family-name:var(--font-ui)]">
            {error}
          </div>
        ) : (
          <p className="text-sm text-ink-muted font-[family-name:var(--font-ui)]">
            {users.total} user{users.total !== 1 ? 's' : ''} total
          </p>
        )}
        <UserList users={users.data} />
      </section>
    </AdminWorkspaceLayout>
  );
}
