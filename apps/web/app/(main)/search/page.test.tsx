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

vi.mock('../../../components/SidebarWrapper', () => ({
  SidebarWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-slot="sidebar-wrapper">{children}</div>
  ),
}));

vi.mock('../../../components/WorkspaceSidebar', () => ({
  WorkspaceSidebar: ({
    knowledgeBases,
    knowledgeBasesUnavailable,
  }: {
    knowledgeBases: Array<{ id: string }>;
    knowledgeBasesUnavailable: boolean;
  }) => (
    <div data-slot="workspace-sidebar">
      WorkspaceSidebar:{knowledgeBases.length}:{knowledgeBasesUnavailable ? 'unavailable' : 'ok'}
    </div>
  ),
}));

vi.mock('../../../components/HeaderUserArea', () => ({
  HeaderUserArea: () => <div data-slot="header-user-area">Header User Area</div>,
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
  SlidersHorizontal: () => <svg data-icon="SlidersHorizontal" />,
  X: () => <svg data-icon="X" />,
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
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/knowledge-bases') {
        return [{ id: 'kb-1', name: 'Housing', slug: 'housing', description: null }];
      }

      if (path.startsWith('/api/workspace/search?')) {
        return {
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
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { default: WorkspaceSearchPage } = await import('./page');
    const tree = await WorkspaceSearchPage({ searchParams: Promise.resolve({ q: 'rent' }) });
    const html = await renderHtml(tree);

    expect(html).toContain('data-slot="sidebar-wrapper"');
    expect(html).toContain('data-slot="workspace-sidebar"');
    expect(html).toContain('data-slot="header-user-area"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('Search results');
    expect(html).toContain('Housing');
    expect(html).toContain('Last edited');
    expect(html).toContain('2026');
    expect(html).toContain('/kb/housing/articles/tenant/rights/rent-stabilization');
  });

  test('shows the empty-state prompt when the query is missing', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/knowledge-bases') {
        return [];
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { default: WorkspaceSearchPage } = await import('./page');
    const tree = await WorkspaceSearchPage({ searchParams: Promise.resolve({}) });
    const html = await renderHtml(tree);

    expect(html).toContain('data-slot="sidebar-wrapper"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('Search across all knowledge bases');
    expect(mockApiFetch.mock.calls.some(([path]) => path === '/api/knowledge-bases')).toBe(true);
    expect(mockApiFetch.mock.calls.some(([path]) => path.startsWith('/api/workspace/search'))).toBe(false);
  });

  test('shows a non-fatal unavailable message when workspace search fails', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/knowledge-bases') {
        return [];
      }

      if (path.startsWith('/api/workspace/search?')) {
        throw new Error('search unavailable');
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { default: WorkspaceSearchPage } = await import('./page');
    const tree = await WorkspaceSearchPage({ searchParams: Promise.resolve({ q: 'rent' }) });
    const html = await renderHtml(tree);

    expect(html).toContain('data-slot="sidebar-wrapper"');
    expect(html).toContain('id="main-content"');
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
