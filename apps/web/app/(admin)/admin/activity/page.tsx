import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../components/admin/AdminWorkspaceLayout';
import { AdminActivityFeed } from '../../../../components/admin/AdminActivityFeed';
import { getAdminNavSections } from '../../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../../lib/admin/workspace';

export default async function AdminActivityPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({ pathname: '/admin/activity' }),
        isGlobalAdmin: true,
        currentKbSlug: null,
      }}
      header={{
        title: 'Recent Activity',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
    >
      <AdminActivityFeed
        items={overview.ok ? overview.activity : []}
        unavailableMessage={overviewWarning}
      />
    </AdminWorkspaceLayout>
  );
}
