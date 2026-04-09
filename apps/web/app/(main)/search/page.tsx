import Link from 'next/link';
import { Search } from 'lucide-react';
import { apiFetch } from '../../../lib/api';
import { articleUrl } from '../../../lib/article-url';
import { Badge } from '../../../components/ui/Badge';
import type { WorkspaceSearchResult } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default async function WorkspaceSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const page = sp.page ? Math.max(parseInt(sp.page, 10) || 1, 1) : 1;

  if (!q) {
    return (
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
          Search
        </h1>
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-ink-muted/40 mx-auto mb-4" />
          <p className="text-ink-muted font-[family-name:var(--font-ui)]">
            Search across all knowledge bases to find articles anywhere in the workspace.
          </p>
        </div>
      </div>
    );
  }

  const params = new URLSearchParams({
    q,
    page: String(page),
    limit: '20',
  });

  let results: PaginatedResponse<WorkspaceSearchResult>;

  try {
    results = await apiFetch<PaginatedResponse<WorkspaceSearchResult>>(`/api/workspace/search?${params.toString()}`);
  } catch {
    return (
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
          Search results
        </h1>
        <p className="text-danger font-[family-name:var(--font-ui)]">
          Search is currently unavailable right now. Please try again later.
        </p>
      </div>
    );
  }

  const totalPages = Math.ceil(results.total / results.limit);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
          Search results
        </h1>
        <p className="mt-1 text-ink-muted font-[family-name:var(--font-ui)] text-sm">
          {results.total} {results.total === 1 ? 'result' : 'results'} for &ldquo;{q}&rdquo;
        </p>
      </header>

      {results.data.length === 0 ? (
        <div className="text-center py-12">
          <Search className="w-10 h-10 text-ink-muted/40 mx-auto mb-3" />
          <p className="text-ink-muted font-[family-name:var(--font-ui)]">
            No articles from any knowledge base match your query.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-1">
            {results.data.map((result) => (
              <li key={result.id}>
                <Link
                  href={articleUrl(result)}
                  className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors truncate">
                        {result.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        <Badge variant="info">{result.knowledgeBaseName}</Badge>
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
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <nav className="mt-8 flex items-center gap-4 font-[family-name:var(--font-ui)] text-sm">
              {page > 1 && (
                <Link
                  href={`/search?${new URLSearchParams({ q, page: String(page - 1), limit: '20' }).toString()}`}
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
                  href={`/search?${new URLSearchParams({ q, page: String(page + 1), limit: '20' }).toString()}`}
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
