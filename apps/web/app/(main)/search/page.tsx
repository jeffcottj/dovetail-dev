import { Suspense } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { SearchFilters } from '../../../components/SearchFilters';
import { Badge } from '../../../components/ui/Badge';
import type { Category } from '@dovetail/types';

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  authorId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  rank?: number;
  similarity?: number;
  chunkText?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

const MODE_DISPLAY: Record<string, string> = {
  fulltext: 'full-text',
  semantic: 'AI-powered',
  hybrid: 'hybrid',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    mode?: string;
    categoryId?: string;
    authorId?: string;
    from?: string;
    to?: string;
    tags?: string;
  }>;
}) {
  const params = await searchParams;
  const { q, page: pageStr, mode, categoryId, authorId, from, to, tags } = params;

  if (!q) {
    return (
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
          Search
        </h1>
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-ink-muted/40 mx-auto mb-4" />
          <p className="text-ink-muted font-[family-name:var(--font-ui)]">
            Enter a query to search published articles.
          </p>
          <p className="text-ink-muted/60 font-[family-name:var(--font-ui)] text-sm mt-1">
            Try using AI-powered mode for conceptual searches.
          </p>
        </div>
      </div>
    );
  }

  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const searchMode = mode || 'fulltext';

  // Build API query params
  const apiParams = new URLSearchParams({ q, page: String(page), limit: '20' });
  if (mode) apiParams.set('mode', mode);
  if (categoryId) apiParams.set('categoryId', categoryId);
  if (authorId) apiParams.set('authorId', authorId);
  if (from) apiParams.set('from', from);
  if (to) apiParams.set('to', to);
  if (tags) apiParams.set('tags', tags);

  let results: PaginatedResponse<SearchResult>;
  let categoryMap = new Map<string, string>();

  try {
    // Fetch search results and categories in parallel
    const [searchResults, categories] = await Promise.all([
      apiFetch<PaginatedResponse<SearchResult>>(`/api/search?${apiParams}`),
      apiFetch<Category[]>('/api/categories').catch(() => [] as Category[]),
    ]);
    results = searchResults;
    categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  } catch {
    return (
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
          Search
        </h1>
        <Suspense>
          <SearchFilters />
        </Suspense>
        <p className="text-danger">Search is currently unavailable. Please try again later.</p>
      </div>
    );
  }

  // Build pagination URL preserving all current params
  function paginationHref(targetPage: number) {
    const p = new URLSearchParams();
    p.set('q', q!);
    p.set('page', String(targetPage));
    if (mode) p.set('mode', mode);
    if (categoryId) p.set('categoryId', categoryId);
    if (authorId) p.set('authorId', authorId);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (tags) p.set('tags', tags);
    return `/search?${p.toString()}`;
  }

  const totalPages = Math.ceil(results.total / results.limit);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          Search results
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">
            {results.total} {results.total === 1 ? 'result' : 'results'} for &ldquo;{q}&rdquo;
          </p>
          <Badge variant={searchMode === 'semantic' ? 'info' : searchMode === 'hybrid' ? 'draft' : 'published'}>
            {MODE_DISPLAY[searchMode] || searchMode} search
          </Badge>
        </div>
      </header>

      <Suspense>
        <SearchFilters />
      </Suspense>

      {results.data.length === 0 ? (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-ink-muted/40 mx-auto mb-3" />
          <p className="text-ink-muted font-[family-name:var(--font-ui)]">
            No published articles match your query.
          </p>
          <p className="text-ink-muted/60 font-[family-name:var(--font-ui)] text-sm mt-2">
            {searchMode === 'fulltext'
              ? 'Try broadening your search or switching to AI-powered mode for conceptual matches.'
              : 'Try different keywords or clear some filters.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-1">
            {results.data.map((result) => (
              <li key={result.id}>
                <Link
                  href={`/articles/${result.slug}`}
                  className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors truncate">
                        {result.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        {categoryMap.get(result.categoryId) && (
                          <span className="text-xs text-accent font-[family-name:var(--font-ui)]">
                            {categoryMap.get(result.categoryId)}
                          </span>
                        )}
                        <span className="text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                          Updated{' '}
                          {new Date(result.updatedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    {/* Relevance indicator */}
                    {result.similarity != null && (
                      <RelevanceIndicator value={result.similarity} label="similarity" />
                    )}
                    {result.rank != null && result.similarity == null && (
                      <RelevanceIndicator value={Math.min(result.rank * 2, 1)} label="relevance" />
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-8 flex items-center gap-4 font-[family-name:var(--font-ui)] text-sm">
              {page > 1 && (
                <Link
                  href={paginationHref(page - 1)}
                  className="text-accent hover:text-accent-hover transition-colors"
                >
                  Previous
                </Link>
              )}
              <span className="text-ink-muted">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={paginationHref(page + 1)}
                  className="text-accent hover:text-accent-hover transition-colors"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function RelevanceIndicator({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex-shrink-0 flex items-center gap-1.5" title={`${label}: ${percent}%`}>
      <div className="w-12 h-1.5 bg-border-light rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-ink-muted font-[family-name:var(--font-ui)] tabular-nums">
        {percent}%
      </span>
    </div>
  );
}
