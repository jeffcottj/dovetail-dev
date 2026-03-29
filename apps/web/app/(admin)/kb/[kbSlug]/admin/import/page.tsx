import { notFound } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import ImportWizard from '../../../../../../components/ImportWizard';
import { Card } from '../../../../../../components/ui/Card';
import { buildKbAdminActions, getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { getKbBySlug } from '../../../../../../lib/kb';

export default async function KbImportPage({ params }: { params: Promise<{ kbSlug: string }> }) {
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
          pathname: `/kb/${kbContext.slug}/admin/import`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
      }}
      header={{
        title: 'Import',
        description: 'Preview uploads, run imports, and review import activity for this knowledge base.',
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
            Import Pipeline
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            Upload an export, review the preview, and publish imported content after the job
            finishes if you start from drafts.
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
        <ImportWizard kbId={kbContext.id} />
      </section>
    </AdminWorkspaceLayout>
  );
}
