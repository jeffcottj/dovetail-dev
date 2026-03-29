import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getKbBySlug } from '../../../../../lib/kb';
import { fetchKbAdminOverview } from '../../../../../lib/admin/kb-workspace';

// Vitest executes this route module with a classic JSX transform, so the page
// expects a global React binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

vi.mock('../../../../../lib/kb', () => ({
  getKbBySlug: vi.fn(),
}));

vi.mock('../../../../../lib/admin/kb-workspace', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/admin/kb-workspace')>(
    '../../../../../lib/admin/kb-workspace'
  );
  return {
    ...actual,
    fetchKbAdminOverview: vi.fn(),
  };
});

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (React.isValidElement(node)) return collectText(node.props.children);
  return '';
}

describe('KbAdminPage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('renders the KB admin shell from overview data', async () => {
    const kb = {
      id: 'kb-1',
      name: 'Housing',
      slug: 'housing',
      description: 'Housing law guidance',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
    };

    vi.mocked(getKbBySlug).mockResolvedValue(kb as never);
    vi.mocked(fetchKbAdminOverview).mockResolvedValue({
      ok: true,
      kb,
      metrics: {
        users: { total: 3 },
        tags: { total: 9 },
        imports: { total: 2 },
        articleActivity: { recent: 4 },
      },
      activity: [
        {
          id: 'evt-1',
          kind: 'article.created',
          createdAt: '2026-03-28T12:00:00.000Z',
          actor: { id: 'user-1', name: 'Maya Chen', email: 'maya@example.com' },
          knowledgeBase: { id: 'kb-1', name: 'Housing' },
          subject: { id: 'article-1', label: 'Eviction Timeline' },
          metadata: {},
        },
      ],
    });

    const { default: KbAdminPage } = await import('./page');
    const tree = await KbAdminPage({ params: Promise.resolve({ kbSlug: 'housing' }) });

    expect(tree.props.header).toMatchObject({
      title: 'KB Overview',
      scopeLabel: 'Housing',
    });
    expect(tree.props.nav.sections[1].label).toBe('Housing');
    expect(tree.props.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: '/kb/housing/admin/users' }),
        expect.objectContaining({ href: '/kb/housing/admin/import' }),
      ]),
    );
    expect(tree.props.metrics).toMatchObject([
      { label: 'KB Users', value: 3 },
      { label: 'Tags', value: 9 },
      { label: 'Imports', value: 2 },
      { label: 'Recent Article Activity', value: 4 },
    ]);
    expect(tree.props.activity).toHaveLength(1);
    expect(tree.props.activityUnavailableMessage).toBeNull();
    expect(collectText(tree.props.children)).toContain('Housing currently has 3 KB role overrides');
  });

  test('shows the degraded overview warning when KB overview data is unavailable', async () => {
    const kb = {
      id: 'kb-1',
      name: 'Housing',
      slug: 'housing',
      description: 'Housing law guidance',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
    };

    vi.mocked(getKbBySlug).mockResolvedValue(kb as never);
    vi.mocked(fetchKbAdminOverview).mockResolvedValue({
      ok: false,
      error: 'API error: 500 Internal Server Error',
    });

    const { default: KbAdminPage } = await import('./page');
    const tree = await KbAdminPage({ params: Promise.resolve({ kbSlug: 'housing' }) });
    const text = collectText(tree.props.children);

    expect(tree.props.nav.sections[1].label).toBe('Housing');
    expect(tree.props.metrics).toEqual([]);
    expect(tree.props.activity).toEqual([]);
    expect(tree.props.activityUnavailableMessage).toBe(
      'Knowledge base admin overview is temporarily unavailable. API error: 500 Internal Server Error',
    );
    expect(text).toContain('Overview unavailable');
    expect(text).toContain('Knowledge base admin overview is temporarily unavailable. API error: 500 Internal Server Error');
  });
});
