import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

// Vitest executes this route module with a classic JSX transform, so the page
// expects a global React binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockUseOptionalKb = vi.fn();

vi.mock('../../../lib/api', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('lucide-react', () => ({
  Search: () => <svg data-icon="Search" />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../lib/hooks/useKb', () => ({
  useOptionalKb: mockUseOptionalKb,
}));

async function renderHtml(node: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }

  html += decoder.decode();

  return html;
}

describe('WorkspaceSearchPage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('renders KB-labeled workspace results with article links', async () => {
    mockApiFetch.mockResolvedValue({
      data: [
        {
          id: 'article-1',
          title: 'Rent Stabilization Guide',
          slug: 'rent-stabilization',
          categoryId: 'cat-1',
          categoryPath: ['tenant', 'rights'],
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: 'Housing',
          knowledgeBaseSlug: 'housing',
          authorId: 'author-1',
          status: 'published',
          createdAt: '2026-04-07T12:00:00.000Z',
          updatedAt: '2026-04-08T12:00:00.000Z',
          rank: 1,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const { default: WorkspaceSearchPage } = await import('./page');
    const tree = await WorkspaceSearchPage({ searchParams: Promise.resolve({ q: 'rent' }) });
    const html = await renderHtml(tree);

    expect(html).toContain('Search results');
    expect(html).toContain('Housing');
    expect(html).toContain('Updated');
    expect(html).toContain('2026');
    expect(html).toContain('/kb/housing/articles/tenant/rights/rent-stabilization');
  });

  test('shows the empty-state prompt when the query is missing', async () => {
    const { default: WorkspaceSearchPage } = await import('./page');
    const tree = await WorkspaceSearchPage({ searchParams: Promise.resolve({}) });
    const html = await renderHtml(tree);

    expect(html).toContain('Search across all knowledge bases');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test('shows a non-fatal unavailable message when workspace search fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('search unavailable'));

    const { default: WorkspaceSearchPage } = await import('./page');
    const tree = await WorkspaceSearchPage({ searchParams: Promise.resolve({ q: 'rent' }) });
    const html = await renderHtml(tree);

    expect(html).toContain('Search is currently unavailable right now.');
  });
});

describe('SearchBar', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('switches to global copy outside KB context', async () => {
    mockUseOptionalKb.mockReturnValue(null);

    const { SearchBar } = await import('../../../components/SearchBar');
    const html = await renderHtml(<SearchBar />);

    expect(html).toContain('Search across all knowledge bases... (Ctrl+K)');
    expect(html).toContain('aria-label="Search across all knowledge bases"');
  });

  test('keeps KB-scoped copy inside KB context', async () => {
    mockUseOptionalKb.mockReturnValue({ slug: 'housing' });

    const { SearchBar } = await import('../../../components/SearchBar');
    const html = await renderHtml(<SearchBar />);

    expect(html).toContain('Search articles... (Ctrl+K)');
    expect(html).toContain('aria-label="Search articles"');
  });
});
