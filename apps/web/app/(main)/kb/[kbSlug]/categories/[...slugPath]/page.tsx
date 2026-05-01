import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilePlus } from 'lucide-react';
import { apiFetch } from '../../../../../../lib/api';
import { getKbBySlug } from '../../../../../../lib/kb';
import { articleUrl } from '../../../../../../lib/article-url';
import { RoleGate } from '../../../../../../components/RoleGate';
import { Button } from '../../../../../../components/ui/Button';
import { CategorySearch } from '../../../../../../components/CategorySearch';
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

export default async function KbCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ kbSlug: string; slugPath: string[] }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { kbSlug, slugPath } = await params;
  const { sort } = await searchParams;
  const sortBy = sort === 'updated' ? 'updated' : 'title';

  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const targetSlug = slugPath[slugPath.length - 1];

  // Fetch all categories for this KB to find the one matching the full path
  const categories = await apiFetch<Category[]>(`/api/knowledge-bases/${kb.id}/categories`);

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
  const selectedCategory = category;

  const articleResponse = await apiFetch<PaginatedResponse<Article>>(
    `/api/knowledge-bases/${kb.id}/articles?categoryId=${selectedCategory.id}&includeDescendants=true&sortBy=${sortBy}&limit=50`,
  );
  const articleList = articleResponse.data;

  function subcategoryLabel(article: Article) {
    if (article.categoryId === selectedCategory.id) return null;

    const names: string[] = [];
    let current = byId.get(article.categoryId);
    while (current && current.id !== selectedCategory.id) {
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    return current?.id === selectedCategory.id && names.length > 0 ? names.join(' / ') : null;
  }

  const alphaHref = `/kb/${kbSlug}/categories/${slugPath.join('/')}`;
  const updatedHref = `${alphaHref}?sort=updated`;

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          {selectedCategory.name}
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mt-1">
          {articleResponse.total} {articleResponse.total === 1 ? 'article' : 'articles'}
        </p>
      </header>

      <CategorySearch categoryId={selectedCategory.id} categoryName={selectedCategory.name} />

      <div className="mb-5 flex items-center justify-end gap-2 font-[family-name:var(--font-ui)] text-xs">
        <span className="text-ink-muted">Sort</span>
        <Link
          href={alphaHref}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${
            sortBy === 'title'
              ? 'bg-accent/10 text-accent'
              : 'text-ink-muted hover:bg-parchment-warm hover:text-ink'
          }`}
        >
          A-Z
        </Link>
        <Link
          href={updatedHref}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${
            sortBy === 'updated'
              ? 'bg-accent/10 text-accent'
              : 'text-ink-muted hover:bg-parchment-warm hover:text-ink'
          }`}
        >
          Last updated
        </Link>
      </div>

      {articleList.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-ink-muted font-[family-name:var(--font-ui)] mb-4">
            No articles in this category yet.
          </p>
          <RoleGate minimumRole="editor">
            <Link href={`/kb/${kbSlug}/articles/new?categoryId=${selectedCategory.id}`}>
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
              {(() => {
                const label = subcategoryLabel(article);
                return (
                  <Link
                    href={articleUrl(article, kbSlug)}
                    className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors truncate">
                            {article.title}
                          </h2>
                          {label ? (
                            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 font-[family-name:var(--font-ui)] text-xs font-medium text-accent">
                              {label}
                            </span>
                          ) : null}
                        </div>
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
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
