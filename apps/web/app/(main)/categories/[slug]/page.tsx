import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import type { Category, Article } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: 'bg-success/10 text-success',
    draft: 'bg-warning/10 text-warning',
    archived: 'bg-ink-muted/10 text-ink-muted',
  };

  return (
    <span className={`text-xs font-[family-name:var(--font-ui)] font-medium px-2 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  );
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch all categories to find the one matching this slug
  const categories = await apiFetch<Category[]>('/api/categories');
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const { data: articleList } = await apiFetch<PaginatedResponse<Article>>(
    `/api/articles?categoryId=${category.id}&limit=50`,
  );

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          {category.name}
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mt-1">
          {articleList.length} {articleList.length === 1 ? 'article' : 'articles'}
        </p>
      </header>

      {articleList.length === 0 ? (
        <p className="text-ink-muted italic">No articles in this category yet.</p>
      ) : (
        <ul className="space-y-1">
          {articleList.map((article) => (
            <li key={article.id}>
              <Link
                href={`/articles/${article.slug}`}
                className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors truncate">
                      {article.title}
                    </h2>
                    <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
                      Updated {new Date(article.updatedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <StatusBadge status={article.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
