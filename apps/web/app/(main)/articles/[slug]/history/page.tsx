import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../../lib/api';
import { auth } from '../../../../../auth';
import { RestoreButton } from '../../../../../components/RestoreButton';
import { Breadcrumbs } from '../../../../../components/Breadcrumbs';
import type { Article, ArticleVersion } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default async function VersionHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-slug/${slug}`);
  } catch {
    notFound();
  }

  const { data: versions } = await apiFetch<PaginatedResponse<ArticleVersion>>(
    `/api/articles/${article.id}/versions?limit=50`,
  );

  const userRole = session?.user?.role ?? 'viewer';
  const canRestore = userRole === 'editor' || userRole === 'admin';

  return (
    <div>
      <header className="mb-8">
        <Breadcrumbs
          segments={[
            { label: article.title, href: `/articles/${slug}` },
            { label: 'History' },
          ]}
        />
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          Version History
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mt-1">
          {versions.length} {versions.length === 1 ? 'version' : 'versions'}
        </p>
      </header>

      {versions.length === 0 ? (
        <p className="text-ink-muted italic">No previous versions yet.</p>
      ) : (
        <div className="space-y-1">
          {versions.map((version) => (
            <div
              key={version.id}
              className="flex items-center justify-between gap-4 px-4 py-3 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-[family-name:var(--font-ui)] text-sm font-semibold text-ink">
                    Version {version.versionNumber}
                  </span>
                  <span className="text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                    &mdash; {version.title}
                  </span>
                </div>
                <time className="text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                  {new Date(version.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              {canRestore && (
                <RestoreButton articleId={article.id} versionId={version.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
