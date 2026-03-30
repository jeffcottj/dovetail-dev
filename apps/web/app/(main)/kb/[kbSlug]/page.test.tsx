import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

// Vitest executes this route module with a classic JSX transform, so the page
// expects a global React binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

const mockAuth = vi.fn();
const mockApiFetch = vi.fn();
const mockGetKbBySlug = vi.fn();
const mockHasMinimumRole = vi.fn();

vi.mock('../../../../auth', () => ({
  auth: mockAuth,
}));

vi.mock('../../../../lib/api', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('../../../../lib/kb', () => ({
  getKbBySlug: mockGetKbBySlug,
}));

vi.mock('../../../../lib/roles', () => ({
  hasMinimumRole: mockHasMinimumRole,
}));

vi.mock('../../../../lib/article-url', () => ({
  articleUrl: vi.fn(() => '/kb/demo/articles/example'),
}));

vi.mock('../../../../components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../components/ui/Badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('lucide-react', () => ({
  Clock: () => <svg data-icon="Clock" />,
  FileEdit: () => <svg data-icon="FileEdit" />,
}));

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (React.isValidElement(node)) return collectText((node.props as Record<string, unknown>).children as React.ReactNode);
  return '';
}

describe('KbHomePage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('keeps the KB title and content sections without the stopgap action row', async () => {
    mockGetKbBySlug.mockResolvedValue({
      id: 'kb-1',
      name: 'Demo KB',
      description: 'Knowledge base description',
    });
    mockAuth.mockResolvedValue({ user: { role: 'editor' } });
    mockHasMinimumRole.mockReturnValue(true);
    mockApiFetch.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });

    const { default: KbHomePage } = await import('./page');
    const tree = await KbHomePage({ params: Promise.resolve({ kbSlug: 'demo' }) });

    expect(collectText(tree)).toContain('Demo KB');
    expect(collectText(tree)).toContain('Knowledge base description');
    expect(collectText(tree)).toContain('Recently Updated');
    expect(collectText(tree)).not.toContain('New Article');
    expect(collectText(tree)).not.toContain('Search');
  });
});
