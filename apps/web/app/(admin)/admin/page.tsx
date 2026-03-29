import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../components/ui/Card';
import { buildGlobalAdminActions, getAdminNavSections } from '../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  buildGlobalAdminSummary,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../lib/admin/workspace';

export default async function AdminPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);

  return (
    <AdminWorkspaceLayout
      nav={{ sections: getAdminNavSections({ pathname: '/admin' }) }}
      header={{
        title: 'Admin Overview',
        description: 'Monitor users, knowledge bases, API keys, and recent activity from one place.',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
      actions={buildGlobalAdminActions()}
      activity={overview.ok ? overview.activity : []}
      activityUnavailableMessage={overviewWarning}
    >
      {overview.ok ? (
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Workspace Summary
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            {buildGlobalAdminSummary(overview)}
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-ink-light">
            Use the quick actions above to create a knowledge base, manage users, or issue an API
            key. The activity feed reflects the latest global changes.
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
