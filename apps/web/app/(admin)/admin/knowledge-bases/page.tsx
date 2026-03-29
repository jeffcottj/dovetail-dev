import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../components/ui/Card';
import { buildGlobalAdminActions, getAdminNavSections } from '../../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../../lib/admin/workspace';
import { fetchAdminResource } from '../../../../lib/admin/resource';
import type { KnowledgeBase } from '@dovetail/types';
import { KbManager } from '../../../(main)/admin/knowledge-bases/KbManager';

export default async function KnowledgeBasesAdminPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);

  const knowledgeBasesResult = await fetchAdminResource<KnowledgeBase[]>('/api/knowledge-bases');

  return (
    <AdminWorkspaceLayout
      nav={{ sections: getAdminNavSections({ pathname: '/admin/knowledge-bases' }) }}
      header={{
        title: 'Knowledge Bases',
        description: 'Create, manage, and configure knowledge bases.',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
      actions={buildGlobalAdminActions()}
      activity={overview.ok ? overview.activity : []}
      activityUnavailableMessage={overviewWarning}
    >
      <section className="space-y-4">
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Knowledge Base Operations
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            Create new knowledge bases, review existing ones, and remove entries that should no
            longer be available to the system.
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
        {!knowledgeBasesResult.ok ? (
          <Card className="border-danger/30 bg-danger/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
              Knowledge bases unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{knowledgeBasesResult.error}</p>
          </Card>
        ) : (
          <KbManager initialKbs={knowledgeBasesResult.data} />
        )}
      </section>
    </AdminWorkspaceLayout>
  );
}
