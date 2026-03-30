import { notFound } from 'next/navigation';
import { auth } from '../../../../../../auth';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import { AdminActivityFeed } from '../../../../../../components/admin/AdminActivityFeed';
import { getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { getKbBySlug } from '../../../../../../lib/kb';

export default async function KbActivityPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const session = await auth();
  const isGlobalAdmin = (session?.user as any)?.role === 'admin';

  const overview = await fetchKbAdminOverview(kb.id);
  const overviewWarning = getKbAdminOverviewWarning(overview);
  const kbContext = overview.ok ? overview.kb : kb;

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({
          pathname: `/kb/${kbContext.slug}/admin/activity`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
        isGlobalAdmin,
        currentKbSlug: kbContext.slug,
        currentKbName: kbContext.name,
      }}
      header={{
        title: 'Recent Activity',
        scopeLabel: kbContext.name,
      }}
      metrics={overview.ok ? buildKbAdminMetrics(overview) : []}
    >
      <AdminActivityFeed
        items={overview.ok ? overview.activity : []}
        unavailableMessage={overviewWarning}
      />
    </AdminWorkspaceLayout>
  );
}
