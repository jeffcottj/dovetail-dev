import type { ReactNode } from 'react';
import Link from 'next/link';
import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../../components/ui/Card';
import { Badge } from '../../../../../components/ui/Badge';
import { getAdminNavSections } from '../../../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../../../lib/admin/workspace';
import { fetchAdminResource } from '../../../../../lib/admin/resource';
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

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);
  const { id } = await params;

  const userResult = await fetchAdminResource<UserData>(`/api/admin/users/${id}`);
  if (!userResult.ok && userResult.kind === 'not_found') {
    redirect('/admin/users');
  }

  let categoryRoles: UserCategoryRole[] = [];
  let categoryRolesError: string | null = null;
  if (userResult.ok) {
    const result = await fetchAdminResource<{ categoryRoles: UserCategoryRole[] }>(
      `/api/admin/users/${id}/category-roles`,
    );
    if (result.ok) {
      categoryRoles = result.data.categoryRoles;
    } else {
      categoryRolesError = result.error;
    }
  }

  let userDetailsSection: ReactNode;
  let categoryRolesSection: ReactNode = null;

  if (userResult.ok) {
    const currentUser = userResult.data;
    const roleBadgeVariant =
      currentUser.role === 'admin' ? 'archived' : currentUser.role === 'editor' ? 'info' : 'draft';

    userDetailsSection = (
      <Card className="!bg-[color:var(--color-admin-panel)]">
        <div className="flex items-start gap-4">
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.name}
              className="h-16 w-16 rounded-full border border-border-light"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-light bg-parchment-warm text-xl font-[family-name:var(--font-display)] text-ink-muted">
              {currentUser.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
          )}
          <div>
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
              Account Details
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-ink">
              {currentUser.name}
            </h2>
            <p className="mt-1 text-sm text-ink-light">{currentUser.email}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={roleBadgeVariant}>{currentUser.role}</Badge>
              <span className="text-xs capitalize text-ink-muted font-[family-name:var(--font-ui)]">
                via {currentUser.provider}
              </span>
            </div>
          </div>
        </div>
      </Card>
    );

    categoryRolesSection = (
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
        {categoryRolesError ? (
          <Card className="border-danger/30 bg-danger/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
              Category roles unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{categoryRolesError}</p>
          </Card>
        ) : (
          <CategoryRoleManager userId={id} initialCategoryRoles={categoryRoles} />
        )}
      </section>
    );
  } else {
    userDetailsSection = (
      <Card className="border-danger/30 bg-danger/10">
        <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
          User unavailable
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{userResult.error}</p>
      </Card>
    );
  }

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({ pathname: '/admin/users' }),
        isGlobalAdmin: true,
        currentKbSlug: null,
      }}
      header={{
        title: userResult.ok ? userResult.data.name : 'User unavailable',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
    >
      <section className="space-y-6">
        <Link href="/admin/users" className="text-sm text-accent hover:underline font-[family-name:var(--font-ui)]">
          &larr; Back to Users
        </Link>

        {overviewWarning ? (
          <Card className="border-warning/40 bg-warning/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
              Overview unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
          </Card>
        ) : null}
        {userDetailsSection}
        {categoryRolesSection}
      </section>
    </AdminWorkspaceLayout>
  );
}
