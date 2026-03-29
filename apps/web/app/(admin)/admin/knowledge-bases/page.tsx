import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../components/ui/Card';
import { buildGlobalAdminActions, getAdminNavSections } from '../../../../lib/admin/nav';
import { buildGlobalAdminMetrics, fetchGlobalAdminOverview } from '../../../../lib/admin/workspace';
import { apiFetch } from '../../../../lib/api';
import type { KnowledgeBase } from '@dovetail/types';
import { KbManager } from '../../../(main)/admin/knowledge-bases/KbManager';

export default async function KnowledgeBasesAdminPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();

  let knowledgeBases: KnowledgeBase[] = [];
  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {
    // API unavailable
  }

  return (
    <AdminWorkspaceLayout
      nav={{ sections: getAdminNavSections({ pathname: '/admin/knowledge-bases' }) }}
      header={{
        title: 'Knowledge Bases',
        description: 'Create, manage, and configure knowledge bases.',
        scopeLabel: 'Global Admin',
      }}
      metrics={buildGlobalAdminMetrics(overview)}
      actions={buildGlobalAdminActions()}
      activity={overview.activity}
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
        <KbManager initialKbs={knowledgeBases} />
      </section>
    </AdminWorkspaceLayout>
  );
}
