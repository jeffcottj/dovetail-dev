import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { AdminWorkspaceLayout } from '../../../../components/admin/AdminWorkspaceLayout';
import { Card } from '../../../../components/ui/Card';
import { getAdminNavSections } from '../../../../lib/admin/nav';
import {
  buildGlobalAdminMetrics,
  fetchGlobalAdminOverview,
  getGlobalAdminOverviewWarning,
} from '../../../../lib/admin/workspace';
import { fetchAdminResource } from '../../../../lib/admin/resource';
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

  const keysResult = await fetchAdminResource<ApiKey[]>('/api/admin/api-keys');

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({ pathname: '/admin/api-keys' }),
        isGlobalAdmin: true,
        currentKbSlug: null,
      }}
      header={{
        title: 'API Keys',
        scopeLabel: 'Global Admin',
      }}
      metrics={overview.ok ? buildGlobalAdminMetrics(overview) : []}
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
        {!keysResult.ok ? (
          <Card className="border-danger/30 bg-danger/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
              API keys unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{keysResult.error}</p>
          </Card>
        ) : (
          <ApiKeyManager initialKeys={keysResult.data} />
        )}
      </section>
    </AdminWorkspaceLayout>
  );
}
