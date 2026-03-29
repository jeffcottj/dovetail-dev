import { notFound } from 'next/navigation';
import type { Tag } from '@dovetail/types';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import { TagList } from '../../../../../../components/TagList';
import { Card } from '../../../../../../components/ui/Card';
import { buildKbAdminActions, getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { fetchAdminResource } from '../../../../../../lib/admin/resource';
import { getKbBySlug } from '../../../../../../lib/kb';

export default async function KbTagsPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const overview = await fetchKbAdminOverview(kb.id);
  const overviewWarning = getKbAdminOverviewWarning(overview);
  const kbContext = overview.ok ? overview.kb : kb;
  const tagsResult = await fetchAdminResource<Tag[]>(`/api/knowledge-bases/${kb.id}/tags`);

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({
          pathname: `/kb/${kbContext.slug}/admin/tags`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
      }}
      header={{
        title: 'Tags',
        description: 'Create and retire tags used to organize content inside this knowledge base.',
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
            Tag Library
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            Keep tag vocabulary clean so editors can classify articles consistently across this
            knowledge base.
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
        {!tagsResult.ok ? (
          <Card className="border-danger/30 bg-danger/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
              Tags unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{tagsResult.error}</p>
          </Card>
        ) : (
          <TagList initialTags={tagsResult.data} />
        )}
      </section>
    </AdminWorkspaceLayout>
  );
}
