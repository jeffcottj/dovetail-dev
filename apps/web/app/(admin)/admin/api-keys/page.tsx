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
import { apiFetch } from '../../../../lib/api';
import { ApiKeyManager } from '../../../(main)/admin/api-keys/ApiKeyManager';

interface ApiKey {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export default async function AdminApiKeysPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const overview = await fetchGlobalAdminOverview();
  const overviewWarning = getGlobalAdminOverviewWarning(overview);

  let keys: ApiKey[] = [];
  try {
    keys = await apiFetch<ApiKey[]>('/api/admin/api-keys');
  } catch {
    // API unavailable
  }

  return (
    <AdminWorkspaceLayout
      nav={{ sections: getAdminNavSections({ pathname: '/admin/api-keys' }) }}
      header={{
        title: 'API Keys',
        description: 'Create, view, and revoke API keys for RAG integrations.',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
      actions={buildGlobalAdminActions()}
      activity={overview.ok ? overview.activity : []}
    >
      <section className="space-y-4">
        <Card className="!bg-[color:var(--color-admin-panel)]">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Integration Access
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-light">
            Issue scoped API keys for integrations, review last-used timestamps, and revoke keys
            that should no longer have access.
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
        <ApiKeyManager initialKeys={keys} />
      </section>
    </AdminWorkspaceLayout>
  );
}
