import { notFound } from 'next/navigation';
import { Card } from '../../../../../../components/ui/Card';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import { buildKbAdminActions, getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { fetchAdminResource } from '../../../../../../lib/admin/resource';
import { getKbBySlug } from '../../../../../../lib/kb';
import type { User } from '@dovetail/types';
import { KbUserManager } from '../../../../../(main)/kb/[kbSlug]/admin/users/KbUserManager';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default async function KbUsersPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const overview = await fetchKbAdminOverview(kb.id);
  const overviewWarning = getKbAdminOverviewWarning(overview);
  const kbContext = overview.ok ? overview.kb : kb;
  const usersResult = await fetchAdminResource<PaginatedResponse<User>>('/api/admin/users?limit=200');

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({
          pathname: `/kb/${kbContext.slug}/admin/users`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
      }}
      header={{
        title: 'Users & Roles',
        description: 'Manage KB-specific role overrides for people who can access this knowledge base.',
        scopeLabel: kbContext.name,
      }}
      metrics={overview.ok ? buildKbAdminMetrics(overview) : []}
      actions={buildKbAdminActions({ slug: kbContext.slug })}
      activity={overview.ok ? overview.activity : []}
      activityUnavailableMessage={overviewWarning}
    >
      <section className="space-y-4">
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            KB Access
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            Review each user&apos;s global role and apply KB-specific overrides where this knowledge
            base needs tighter access control.
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
