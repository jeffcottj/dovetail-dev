import { notFound } from 'next/navigation';
import { auth } from '../../../../../../auth';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../../../components/ui/Card';
import { getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { getKbBySlug } from '../../../../../../lib/kb';
import { KbAccessPolicySettings } from './KbAccessPolicySettings';

export default async function KbSettingsPage({ params }: { params: Promise<{ kbSlug: string }> }) {
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
          pathname: `/kb/${kbContext.slug}/admin/settings`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
        isGlobalAdmin,
        currentKbSlug: kbContext.slug,
        currentKbName: kbContext.name,
      }}
      header={{
        title: 'Settings',
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
        <KbAccessPolicySettings kb={kbContext} />
      </section>
    </AdminWorkspaceLayout>
  );
}
