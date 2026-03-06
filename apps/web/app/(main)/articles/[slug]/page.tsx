import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { auth } from '../../../../auth';
import { ArticleContent } from '../../../../components/ArticleContent';
import type { Article } from '@dovetail/types';

export default async function ArticlePage({
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

  const userRole = session?.user?.role ?? 'viewer';
  const canEdit = userRole === 'editor' || userRole === 'admin';

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
                href={`/articles/${slug}/history`}
                className="hover:text-accent transition-colors"
              >
                View history
              </Link>
            </div>
          </div>
          {canEdit && (
            <Link
              href={`/articles/${slug}/edit`}
              className="shrink-0 font-[family-name:var(--font-ui)] text-sm px-4 py-2 bg-accent text-parchment rounded hover:bg-accent-hover transition-colors"
            >
              Edit
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-prose">
        <ArticleContent content={article.content} />
      </div>
    </article>
  );
}
