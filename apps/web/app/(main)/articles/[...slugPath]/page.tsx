import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { auth } from '../../../../auth';
import { ArticleContent } from '../../../../components/ArticleContent';
import { ArticleActions } from '../../../../components/ArticleActions';
import { ArticleEditor } from '../../../../components/ArticleEditor';
import { RestoreButton } from '../../../../components/RestoreButton';
import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import { Badge } from '../../../../components/ui/Badge';
import type { Article, ArticleVersion, Category, Tag } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default async function ArticleCatchAllPage({
  params,
}: {
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
  const lastSegment = slugPath[slugPath.length - 1];

  // Dispatch based on trailing segment
  if (lastSegment === 'edit') {
    return renderEditPage(slugPath.slice(0, -1));
  }
  if (lastSegment === 'history') {
    return renderHistoryPage(slugPath.slice(0, -1));
  }
  return renderViewPage(slugPath);
}

// ── View ────────────────────────────────────────────────────────────────────

async function renderViewPage(slugPath: string[]) {
  const session = await auth();

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
  } catch {
    notFound();
  }

  const fullPath = `/articles/${slugPath.join('/')}`;
  const userRole = session?.user?.role ?? 'viewer';
  const canEdit = userRole === 'editor' || userRole === 'admin';

  let categories: Category[] = [];
  if (canEdit) {
    try {
      categories = await apiFetch<Category[]>('/api/categories');
    } catch {
      // Categories unavailable
    }
  }

  let articleTags: Tag[] = [];
  try {
    articleTags = await apiFetch<Tag[]>(`/api/articles/${article.id}/tags`);
  } catch {
    // Tags unavailable
  }

  return (
    <article>
      <header className="mb-8 border-b border-border-light pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight leading-tight">
              {article.title}
            </h1>
            <div className="flex items-center gap-3 mt-3 text-xs font-[family-name:var(--font-ui)] text-ink-muted">
              <Badge variant={article.status as 'published' | 'draft' | 'archived'}>
                {article.status.charAt(0).toUpperCase() + article.status.slice(1)}
              </Badge>
              <span className="text-border">|</span>
              <time dateTime={new Date(article.updatedAt).toISOString()}>
                Updated{' '}
                {new Date(article.updatedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
              <span className="text-border">|</span>
              <Link
                href={`${fullPath}/history`}
                className="hover:text-accent transition-colors"
              >
                View history
              </Link>
            </div>
            {articleTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {articleTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/search?tags=${tag.id}`}
                    className="inline-flex items-center text-xs font-[family-name:var(--font-ui)] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {canEdit && (
            <ArticleActions article={article} categories={categories} />
          )}
        </div>
      </header>

      <div className="max-w-prose">
        <ArticleContent content={article.content} />
      </div>
    </article>
  );
}

// ── Edit ────────────────────────────────────────────────────────────────────

async function renderEditPage(slugPath: string[]) {
  const session = await auth();
  const userRole = session?.user?.role ?? 'viewer';

  if (userRole === 'viewer') {
    redirect(`/articles/${slugPath.join('/')}`);
  }

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
  } catch {
    notFound();
  }

  return (
    <div>
      <div className="mb-4">
        <span className="text-xs font-[family-name:var(--font-ui)] text-ink-muted uppercase tracking-widest">
          Editing
        </span>
      </div>
      <ArticleEditor article={article} />
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

async function renderHistoryPage(slugPath: string[]) {
  const session = await auth();

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
  } catch {
    notFound();
  }

  const fullPath = `/articles/${slugPath.join('/')}`;

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
            { label: article.title, href: fullPath },
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
