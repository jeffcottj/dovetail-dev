import Link from 'next/link';
import { apiFetch } from '../../../lib/api';

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  authorId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  rank: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; categoryId?: string }>;
}) {
  const { q, page: pageStr, categoryId } = await searchParams;

  if (!q) {
    return (
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
          Search
        </h1>
        <p className="text-ink-muted">Enter a query to search published articles.</p>
      </div>
    );
  }

  const page = pageStr ? parseInt(pageStr, 10) : 1;
  const params = new URLSearchParams({ q, page: String(page), limit: '20' });
  if (categoryId) params.set('categoryId', categoryId);

  let results: PaginatedResponse<SearchResult>;
  try {
    results = await apiFetch<PaginatedResponse<SearchResult>>(`/api/search?${params}`);
  } catch {
    return (
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
          Search
        </h1>
        <p className="text-danger">Search is currently unavailable. Please try again later.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          Search results
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mt-1">
          {results.total} {results.total === 1 ? 'result' : 'results'} for &ldquo;{q}&rdquo;
        </p>
      </header>

      {results.data.length === 0 ? (
        <p className="text-ink-muted italic">No published articles match your query.</p>
      ) : (
        <>
          <ul className="space-y-1">
            {results.data.map((result) => (
              <li key={result.id}>
                <Link
                  href={`/articles/${result.slug}`}
                  className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
                >
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors">
                    {result.title}
                  </h2>
                  <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
                    Updated{' '}
                    {new Date(result.updatedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {results.total > results.limit && (
            <nav className="mt-8 flex items-center gap-4 font-[family-name:var(--font-ui)] text-sm">
              {page > 1 && (
                <Link
                  href={`/search?q=${encodeURIComponent(q)}&page=${page - 1}`}
                  className="text-accent hover:text-accent-hover transition-colors"
                >
                  Previous
                </Link>
              )}
              <span className="text-ink-muted">
                Page {page} of {Math.ceil(results.total / results.limit)}
              </span>
              {page * results.limit < results.total && (
                <Link
                  href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`}
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
