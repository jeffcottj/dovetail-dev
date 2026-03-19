import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilePlus } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { articleUrl } from '../../../../lib/article-url';
import { RoleGate } from '../../../../components/RoleGate';
import { Button } from '../../../../components/ui/Button';
import { CategorySearch } from '../../../../components/CategorySearch';
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
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
  const targetSlug = slugPath[slugPath.length - 1];

  // Fetch all categories to find the one matching the full path
  const categories = await apiFetch<Category[]>('/api/categories');

  // Build a lookup to resolve the path
  const byId = new Map(categories.map((c) => [c.id, c]));

  // Find categories matching the target slug, then verify the full path
  const candidates = categories.filter((c) => c.slug === targetSlug);
  const category = candidates.find((c) => {
    const path: string[] = [];
    let current: Category | undefined = c;
    while (current) {
      path.unshift(current.slug);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path.length === slugPath.length && path.every((s, i) => s === slugPath[i]);
  });

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

      <CategorySearch categoryId={category.id} categoryName={category.name} />

      {articleList.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-ink-muted font-[family-name:var(--font-ui)] mb-4">
            No articles in this category yet.
          </p>
          <RoleGate minimumRole="editor">
            <Link href={`/articles/new?categoryId=${category.id}`}>
              <Button>
                <FilePlus className="w-4 h-4" />
                Create the first article
              </Button>
            </Link>
          </RoleGate>
        </div>
      ) : (
        <ul className="space-y-1">
          {articleList.map((article) => (
            <li key={article.id}>
              <Link
                href={articleUrl(article)}
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
