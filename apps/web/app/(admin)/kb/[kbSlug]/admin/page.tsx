import { notFound } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../../components/ui/Card';
import { buildKbAdminActions, getAdminNavSections } from '../../../../../lib/admin/nav';
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
      }}
      header={{
        title: 'KB Overview',
        description: 'Monitor KB roles, tags, imports, and recent article activity for this knowledge base.',
        scopeLabel: kbContext.name,
      }}
      metrics={overview.ok ? buildKbAdminMetrics(overview) : []}
      actions={buildKbAdminActions({ slug: kbContext.slug })}
      activity={overview.ok ? overview.activity : []}
      activityUnavailableMessage={overviewWarning}
    >
      {overview.ok ? (
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Workspace Summary
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            {buildKbAdminSummary(overview)}
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-ink-light">
            Use the quick actions above to manage KB roles, curate tags, or start a new import.
            The activity feed reflects the latest KB-scoped administrative changes.
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
