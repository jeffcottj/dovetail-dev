import { notFound } from 'next/navigation';
import { auth } from '../../../../../auth';
import { AdminWorkspaceLayout } from '../../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../../components/ui/Card';
import { getAdminNavSections } from '../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  buildKbAdminSummary,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../lib/admin/kb-workspace';
import { getKbBySlug } from '../../../../../lib/kb';

export default async function KbAdminPage({ params }: { params: Promise<{ kbSlug: string }> }) {
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
          pathname: `/kb/${kbContext.slug}/admin`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
        isGlobalAdmin,
        currentKbSlug: kbContext.slug,
        currentKbName: kbContext.name,
      }}
      header={{
        title: 'KB Overview',
        scopeLabel: kbContext.name,
      }}
      metrics={overview.ok ? buildKbAdminMetrics(overview) : []}
    >
      {overview.ok ? (
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Workspace Summary
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            {buildKbAdminSummary(overview)}
          </p>
        </Card>
      ) : (
        <Card className="border-warning/40 bg-warning/10">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-warning">
            Overview unavailable
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">{overviewWarning}</p>
        </Card>
      )}
    </AdminWorkspaceLayout>
  );
}
