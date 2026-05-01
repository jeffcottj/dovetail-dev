import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

(globalThis as any).React = React;

const mockApiFetch = vi.fn();
const mockGetKbBySlug = vi.fn();

vi.mock('../../../../../../lib/api', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('../../../../../../lib/kb', () => ({
  getKbBySlug: mockGetKbBySlug,
}));

vi.mock('../../../../../../lib/article-url', () => ({
  articleUrl: vi.fn((article) => `/articles/${article.slug}`),
}));

vi.mock('../../../../../../components/RoleGate', () => ({
  RoleGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../../../components/ui/Button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('../../../../../../components/CategorySearch', () => ({
  CategorySearch: () => <div data-testid="category-search" />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('lucide-react', () => ({
  FilePlus: () => <svg data-icon="FilePlus" />,
}));

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (React.isValidElement(node)) return collectText((node.props as Record<string, unknown>).children as React.ReactNode);
  return '';
}

const categories = [
  { id: 'cat-housing', name: 'Housing', slug: 'housing', parentId: null, knowledgeBaseId: 'kb-1', createdAt: new Date() },
  { id: 'cat-evictions', name: 'Evictions', slug: 'evictions', parentId: 'cat-housing', knowledgeBaseId: 'kb-1', createdAt: new Date() },
  { id: 'cat-private', name: 'Private Landlord', slug: 'private-landlord', parentId: 'cat-evictions', knowledgeBaseId: 'kb-1', createdAt: new Date() },
];

describe('KbCategoryPage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('requests descendant articles sorted alphabetically and labels nested article paths', async () => {
    mockGetKbBySlug.mockResolvedValue({ id: 'kb-1', name: 'Demo', slug: 'demo' });
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.endsWith('/categories')) return categories;
      return {
        data: [
          {
            id: 'article-root',
            title: 'At Root',
            slug: 'at-root',
            categoryId: 'cat-housing',
            status: 'published',
            updatedAt: new Date('2026-01-01'),
          },
          {
            id: 'article-child',
            title: 'Nested Article',
            slug: 'nested-article',
            categoryId: 'cat-private',
            status: 'published',
            updatedAt: new Date('2026-01-02'),
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
      };
    });

    const { default: KbCategoryPage } = await import('./page');
    const tree = await KbCategoryPage({
      params: Promise.resolve({ kbSlug: 'demo', slugPath: ['housing'] }),
      searchParams: Promise.resolve({}),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/knowledge-bases/kb-1/articles?categoryId=cat-housing&includeDescendants=true&sortBy=title&limit=50',
    );
    expect(collectText(tree)).toContain('Nested Article');
    expect(collectText(tree)).toContain('Evictions / Private Landlord');
  });

  test('uses updated sort when requested', async () => {
    mockGetKbBySlug.mockResolvedValue({ id: 'kb-1', name: 'Demo', slug: 'demo' });
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.endsWith('/categories')) return categories;
      return { data: [], total: 0, page: 1, limit: 50 };
    });

    const { default: KbCategoryPage } = await import('./page');
    await KbCategoryPage({
      params: Promise.resolve({ kbSlug: 'demo', slugPath: ['housing'] }),
      searchParams: Promise.resolve({ sort: 'updated' }),
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/knowledge-bases/kb-1/articles?categoryId=cat-housing&includeDescendants=true&sortBy=updated&limit=50',
    );
  });
});
