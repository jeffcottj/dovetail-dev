import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getKbBySlug } from '../../../../../../lib/kb';
import { fetchKbAdminOverview } from '../../../../../../lib/admin/kb-workspace';
import { fetchAdminResource } from '../../../../../../lib/admin/resource';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

vi.mock('../../../../../../lib/kb', () => ({
  getKbBySlug: vi.fn(),
}));

vi.mock('../../../../../../lib/admin/kb-workspace', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../lib/admin/kb-workspace')>(
    '../../../../../../lib/admin/kb-workspace'
  );
  return {
    ...actual,
    fetchKbAdminOverview: vi.fn(),
  };
});

vi.mock('../../../../../../lib/admin/resource', () => ({
  fetchAdminResource: vi.fn(),
}));

vi.mock('../../../../../(main)/kb/[kbSlug]/admin/users/KbUserManager', () => ({
  KbUserManager: ({ kbId, users }: { kbId: string; users: Array<{ id: string }> }) => (
    <div data-kb-id={kbId}>manager:{users.map((user) => user.id).join(',')}</div>
  ),
}));

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (React.isValidElement(node)) return collectText(node.props.children);
  return '';
}

describe('KbUsersPage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('requests a valid user page size and renders the KB user manager', async () => {
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
        users: { total: 0 },
        tags: { total: 1 },
        imports: { total: 0 },
        articleActivity: { recent: 0 },
      },
      activity: [],
    });
    vi.mocked(fetchAdminResource).mockResolvedValue({
      ok: true,
      data: {
        data: [
          {
            id: 'user-1',
            email: 'admin@local.dovetail.test',
            name: 'Local Admin',
            role: 'admin',
            provider: 'google',
            avatarUrl: null,
            createdAt: new Date('2026-03-28T12:00:00.000Z'),
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
      },
    });

    const { default: KbUsersPage } = await import('./page');
    const tree = await KbUsersPage({ params: Promise.resolve({ kbSlug: 'housing' }) });
    const text = collectText(tree.props.children);

    expect(fetchAdminResource).toHaveBeenCalledWith('/api/admin/users?limit=100');
    expect(text).toContain('1 user available for KB role assignment');
  });
});
