import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { StaleContentResult } from '@dovetail/types';
import { auth } from '../../../../../../auth';
import { AdminWorkspaceLayout } from '../../../../../../components/admin/AdminWorkspaceLayout';
import { Badge } from '../../../../../../components/ui/Badge';
import { Card } from '../../../../../../components/ui/Card';
import { getAdminNavSections } from '../../../../../../lib/admin/nav';
import {
  buildKbAdminMetrics,
  fetchKbAdminOverview,
  getKbAdminOverviewWarning,
} from '../../../../../../lib/admin/kb-workspace';
import { fetchAdminResource } from '../../../../../../lib/admin/resource';
import { articleUrl } from '../../../../../../lib/article-url';
import { getKbBySlug } from '../../../../../../lib/kb';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function defaultUpdatedBefore() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return `${date.toISOString().split('T')[0]}T23:59:59.999Z`;
}

function normalizeDateParam(value: string | undefined) {
  if (!value) return defaultUpdatedBefore();
  return value.includes('T') ? value : `${value}T23:59:59.999Z`;
}

export default async function KbMaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ kbSlug: string }>;
  searchParams: Promise<{ page?: string; updatedBefore?: string; status?: string }>;
}) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const session = await auth();
  const isGlobalAdmin = (session?.user as any)?.role === 'admin';

  const sp = await searchParams;
  const page = sp.page ? Math.max(parseInt(sp.page, 10) || 1, 1) : 1;
  const updatedBefore = normalizeDateParam(sp.updatedBefore);

  const overview = await fetchKbAdminOverview(kb.id);
  const overviewWarning = getKbAdminOverviewWarning(overview);
  const kbContext = overview.ok ? overview.kb : kb;

  const apiParams = new URLSearchParams({
    page: String(page),
    limit: '25',
    updatedBefore,
  });
  if (sp.status) apiParams.set('status', sp.status);

  const staleResult = await fetchAdminResource<PaginatedResponse<StaleContentResult>>(
    `/api/knowledge-bases/${kb.id}/admin/maintenance/stale?${apiParams.toString()}`,
  );

  const totalPages = staleResult.ok ? Math.ceil(staleResult.data.total / staleResult.data.limit) : 0;
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams({ page: String(targetPage), updatedBefore });
    if (sp.status) params.set('status', sp.status);
    return `/kb/${kbContext.slug}/admin/maintenance?${params.toString()}`;
  };

  return (
    <AdminWorkspaceLayout
      nav={{
        sections: getAdminNavSections({
          pathname: `/kb/${kbContext.slug}/admin/maintenance`,
          kb: { slug: kbContext.slug, name: kbContext.name },
        }),
        isGlobalAdmin,
        currentKbSlug: kbContext.slug,
        currentKbName: kbContext.name,
      }}
      header={{
        title: 'Maintenance',
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

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
              Stale content
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Articles last changed before {formatDate(updatedBefore)}, limited to content you can edit.
            </p>
          </div>
          <form className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              name="updatedBefore"
              defaultValue={updatedBefore.split('T')[0]}
              className="rounded-lg border border-border-light bg-parchment px-3 py-1.5 text-sm text-ink"
            />
            <select
              name="status"
              defaultValue={sp.status ?? ''}
              className="rounded-lg border border-border-light bg-parchment px-3 py-1.5 text-sm text-ink"
            >
              <option value="">Published only</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <button className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-parchment" type="submit">
              Apply
            </button>
          </form>
        </div>

        {!staleResult.ok ? (
          <Card className="border-danger/30 bg-danger/10">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-danger">
              Maintenance unavailable
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-danger">{staleResult.error}</p>
          </Card>
        ) : staleResult.data.data.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-light">No stale articles match the current filters.</p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-light bg-parchment">
            <table className="min-w-full divide-y divide-border-light text-sm">
              <thead className="bg-parchment-warm text-left text-xs uppercase tracking-[0.16em] text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Article</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Last edited</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {staleResult.data.data.map((article) => (
                  <tr key={article.id}>
                    <td className="px-4 py-3">
                      <Link href={articleUrl(article)} className="font-medium text-ink hover:text-accent">
                        {article.title}
                      </Link>
                      <p className="mt-1 text-xs text-ink-muted">Created {formatDate(article.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {article.categoryPath?.length ? article.categoryPath.join(' / ') : 'Uncategorized'}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      <span>{formatDate(article.updatedAt)}</span>
                      {article.lastEditedByName ? (
                        <span className="block text-xs">by {article.lastEditedByName}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={article.status === 'published' ? 'published' : article.status === 'draft' ? 'draft' : 'archived'}>
                        {article.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`${articleUrl(article)}/edit`}
                        className="text-sm font-medium text-accent hover:text-accent-hover"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {staleResult.ok && totalPages > 1 ? (
          <nav className="flex items-center gap-4 text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-accent hover:text-accent-hover">
                Previous
              </Link>
            ) : null}
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-accent hover:text-accent-hover">
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </AdminWorkspaceLayout>
  );
}
