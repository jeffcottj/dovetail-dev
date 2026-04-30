import { Suspense } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { HeaderUserArea } from '../../../components/HeaderUserArea';
import { apiFetch } from '../../../lib/api';
import { articleUrl } from '../../../lib/article-url';
import { SearchBar } from '../../../components/SearchBar';
import { SearchFilters } from '../../../components/SearchFilters';
import { SidebarWrapper } from '../../../components/SidebarWrapper';
import { WorkspaceSidebar } from '../../../components/WorkspaceSidebar';
import { Badge } from '../../../components/ui/Badge';
import type { KnowledgeBase, WorkspaceSearchResult } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

function lastEditedLabel(result: WorkspaceSearchResult) {
  const date = new Date(result.updatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return result.lastEditedByName
    ? `Last edited by ${result.lastEditedByName} on ${date}`
    : `Last edited ${date}`;
}

export default async function WorkspaceSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    mode?: string;
    knowledgeBaseIds?: string;
    categoryId?: string;
    from?: string;
    to?: string;
    tags?: string;
    onlyEditable?: string;
  }>;
}) {
  let knowledgeBases: KnowledgeBase[] = [];
  let knowledgeBasesUnavailable = false;

  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {
    knowledgeBasesUnavailable = true;
  }

  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const page = sp.page ? Math.max(parseInt(sp.page, 10) || 1, 1) : 1;

  let results: PaginatedResponse<WorkspaceSearchResult> | null = null;
  let searchUnavailable = false;

  if (q) {
    const params = new URLSearchParams({
      q,
      page: String(page),
      limit: '20',
    });
    if (sp.mode) params.set('mode', sp.mode);
    if (sp.knowledgeBaseIds) params.set('knowledgeBaseIds', sp.knowledgeBaseIds);
    if (sp.categoryId) params.set('categoryId', sp.categoryId);
    if (sp.from) params.set('from', sp.from);
    if (sp.to) params.set('to', sp.to);
    if (sp.tags) params.set('tags', sp.tags);
    if (sp.onlyEditable) params.set('onlyEditable', sp.onlyEditable);

    try {
      results = await apiFetch<PaginatedResponse<WorkspaceSearchResult>>(`/api/workspace/search?${params.toString()}`);
    } catch {
      searchUnavailable = true;
    }
  }

  function paginationHref(targetPage: number) {
    const params = new URLSearchParams({ q, page: String(targetPage), limit: '20' });
    if (sp.mode) params.set('mode', sp.mode);
    if (sp.knowledgeBaseIds) params.set('knowledgeBaseIds', sp.knowledgeBaseIds);
    if (sp.categoryId) params.set('categoryId', sp.categoryId);
    if (sp.from) params.set('from', sp.from);
    if (sp.to) params.set('to', sp.to);
    if (sp.tags) params.set('tags', sp.tags);
    if (sp.onlyEditable) params.set('onlyEditable', sp.onlyEditable);
    return `/search?${params.toString()}`;
  }

  return (
    <>
      <SidebarWrapper toggleClassName="top-15 -right-4 -translate-y-1/2">
        <WorkspaceSidebar
          knowledgeBases={knowledgeBases}
          knowledgeBasesUnavailable={knowledgeBasesUnavailable}
        />
      </SidebarWrapper>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border-light px-6 py-3 flex items-center justify-between">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
          <HeaderUserArea />
        </header>
        <main id="main-content" className="flex-1 min-w-0 p-8">
          {q ? (
            searchUnavailable ? (
              <div>
                <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
                  Search results
                </h1>
                <p className="text-danger font-[family-name:var(--font-ui)]">
                  Search is currently unavailable right now. Please try again later.
                </p>
              </div>
            ) : results ? (
              <div>
                <header className="mb-6">
                  <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
                    Search results
                  </h1>
                  <p className="mt-1 text-ink-muted font-[family-name:var(--font-ui)] text-sm">
                    {results.total} {results.total === 1 ? 'result' : 'results'} for &ldquo;{q}&rdquo;
                  </p>
                </header>

                <Suspense>
                  <SearchFilters />
                </Suspense>

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
                                  {result.categoryPath && result.categoryPath.length > 0 && (
                                    <span className="text-xs text-accent font-[family-name:var(--font-ui)]">
                                      {result.categoryPath.join(' / ')}
                                    </span>
                                  )}
                                  <span className="text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                                    {lastEditedLabel(result)}
                                  </span>
                                </div>
                                {result.snippet ? (
                                  <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                                    {result.snippet.replace(/<[^>]+>/g, '')}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>

                    {Math.ceil(results.total / results.limit) > 1 && (
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
                          Page {page} of {Math.ceil(results.total / results.limit)}
                        </span>
                        {page < Math.ceil(results.total / results.limit) && (
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
            ) : null
          ) : (
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight mb-4">
                Search
              </h1>
              <Suspense>
                <SearchFilters />
              </Suspense>
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-ink-muted/40 mx-auto mb-4" />
                <p className="text-ink-muted font-[family-name:var(--font-ui)]">
                  Search across all knowledge bases to find articles anywhere in the workspace.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
