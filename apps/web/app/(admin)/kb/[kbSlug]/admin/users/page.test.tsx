import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getKbBySlug } from '../../../../../../lib/kb';
import { fetchKbAdminOverview } from '../../../../../../lib/admin/kb-workspace';
import { fetchAdminResource } from '../../../../../../lib/admin/resource';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

const mockKbUserManager = vi.fn(
  ({ kbId, users }: { kbId: string; users: Array<{ id: string }> }) => (
    <div data-kb-id={kbId}>
      manager-count:{users.length};manager-last:{users.at(-1)?.id ?? 'none'};manager:
      {users.map((user) => user.id).join(',')}
    </div>
  ),
);

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
  KbUserManager: mockKbUserManager,
}));

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (React.isValidElement(node)) {
    if (typeof node.type === 'function') return collectText(node.type(node.props));
    return collectText(node.props.children);
  }
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
    expect(mockKbUserManager.mock.calls[0]?.[0].kbId).toBe('kb-1');
    expect(mockKbUserManager.mock.calls[0]?.[0].users).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'user-1' })]),
    );
  });

  test('fetches every admin user page so all users are available for KB role assignment', async () => {
    const kb = {
      id: 'kb-1',
      name: 'Housing',
      slug: 'housing',
      description: 'Housing law guidance',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
    };

    const firstPageUsers = Array.from({ length: 100 }, (_, index) => ({
      id: `user-${index + 1}`,
      email: `user-${index + 1}@local.dovetail.test`,
      name: `User ${index + 1}`,
      role: 'viewer' as const,
      provider: 'google',
      avatarUrl: null,
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
    }));
    const finalUser = {
      id: 'user-101',
      email: 'user-101@local.dovetail.test',
      name: 'User 101',
      role: 'viewer' as const,
      provider: 'google',
      avatarUrl: null,
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
    vi.mocked(fetchAdminResource)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          data: firstPageUsers,
          total: 101,
          page: 1,
          limit: 100,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          data: [finalUser],
          total: 101,
          page: 2,
          limit: 100,
        },
      });

    const { default: KbUsersPage } = await import('./page');
    const tree = await KbUsersPage({ params: Promise.resolve({ kbSlug: 'housing' }) });
    const text = collectText(tree.props.children);

    expect(fetchAdminResource).toHaveBeenNthCalledWith(1, '/api/admin/users?limit=100');
    expect(fetchAdminResource).toHaveBeenNthCalledWith(2, '/api/admin/users?limit=100&page=2');
    expect(text).toContain('101 users available for KB role assignment');
    expect(text).toContain('manager-count:101');
    expect(text).toContain('manager-last:user-101');
    expect(mockKbUserManager.mock.calls[0]?.[0].kbId).toBe('kb-1');
    expect(mockKbUserManager.mock.calls[0]?.[0].users).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'user-1' }), finalUser]),
    );
    expect(mockKbUserManager.mock.calls[0]?.[0].users).toHaveLength(101);
    expect(mockKbUserManager.mock.calls[0]?.[0].users.at(-1)?.id).toBe('user-101');
  });
});
