import { notFound } from 'next/navigation';
import { auth } from '../../../../../../auth';
import { Card } from '../../../../../../components/ui/Card';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import { getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { fetchAdminResource } from '../../../../../../lib/admin/resource';
import { getKbBySlug } from '../../../../../../lib/kb';
import type { User } from '@dovetail/types';
import { KbUserManager } from '../../../../../(main)/kb/[kbSlug]/admin/users/KbUserManager';

const ADMIN_USER_PAGE_SIZE = 100;

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

async function fetchAllAdminUsers() {
  const firstPage = await fetchAdminResource<PaginatedResponse<User>>(
    `/api/admin/users?limit=${ADMIN_USER_PAGE_SIZE}`
  );
  if (!firstPage.ok) return firstPage;

  const users = [...firstPage.data.data];
  const totalPages = Math.ceil(firstPage.data.total / firstPage.data.limit);

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await fetchAdminResource<PaginatedResponse<User>>(
      `/api/admin/users?limit=${ADMIN_USER_PAGE_SIZE}&page=${page}`
    );
    if (!nextPage.ok) return nextPage;
    users.push(...nextPage.data.data);
  }

  return {
    ok: true as const,
    data: {
      ...firstPage.data,
      data: users,
    },
  };
}

export default async function KbUsersPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const session = await auth();
  const isGlobalAdmin = (session?.user as any)?.role === 'admin';

  const overview = await fetchKbAdminOverview(kb.id);
  const overviewWarning = getKbAdminOverviewWarning(overview);
  const kbContext = overview.ok ? overview.kb : kb;
  const usersResult = await fetchAllAdminUsers();

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({
          pathname: `/kb/${kbContext.slug}/admin/users`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
        isGlobalAdmin,
        currentKbSlug: kbContext.slug,
        currentKbName: kbContext.name,
      }}
      header={{
        title: 'Users & Roles',
        scopeLabel: kbContext.name,
      }}
      metrics={overview.ok ? buildKbAdminMetrics(overview) : []}
    >
      <section className="space-y-4">
        {overviewWarning ? (
          <Card className="border-warning/40 bg-warning/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
              Overview unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
          </Card>
        ) : null}
        {!usersResult.ok ? (
          <Card className="border-danger/30 bg-danger/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
              Users unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{usersResult.error}</p>
          </Card>
        ) : (
          <p className="font-[family-name:var(--font-ui)] text-sm text-ink-muted">
            {usersResult.data.total} user{usersResult.data.total !== 1 ? 's' : ''} available for
            KB role assignment
          </p>
        )}
        {usersResult.ok ? <KbUserManager users={usersResult.data.data} kbId={kbContext.id} /> : null}
      </section>
    </AdminWorkspaceLayout>
  );
}
