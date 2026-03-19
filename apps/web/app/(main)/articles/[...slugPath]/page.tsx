import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { auth } from '../../../../auth';
import { ArticleContent } from '../../../../components/ArticleContent';
import { ArticleActions } from '../../../../components/ArticleActions';
import type { Article, Category, Tag } from '@dovetail/types';

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
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
