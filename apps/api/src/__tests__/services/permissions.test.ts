import { describe, expect, it, vi, type Mock, beforeEach } from 'vitest';

vi.mock('@dovetail/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dovetail/db')>();
  return {
    ...actual,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import { db } from '@dovetail/db';
import {
  canViewKnowledgeBase,
  hasMinimumRole,
  isGlobalAdmin,
  listVisibleKnowledgeBases,
  resolveEffectiveCategoryRole,
  resolveEffectiveKbRole,
  resolveRole,
} from '../../services/permissions.js';

describe('resolveRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns category role when one exists (most specific wins)', async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ role: 'editor' }]);

    const role = await resolveRole('user-1', 'cat-1', 'kb-1', 'viewer');
    expect(role).toBe('editor');
  });

  it('falls back to KB role when no category role exists', async () => {
    (db.execute as Mock).mockResolvedValueOnce([]);
    (db.execute as Mock).mockResolvedValueOnce([{ role: 'admin' }]);

    const role = await resolveRole('user-1', 'cat-1', 'kb-1', 'viewer');
    expect(role).toBe('admin');
  });

  it('falls back to global role when no category or KB role exists', async () => {
    (db.execute as Mock).mockResolvedValueOnce([]);
    (db.execute as Mock).mockResolvedValueOnce([]);

    const role = await resolveRole('user-1', 'cat-1', 'kb-1', 'viewer');
    expect(role).toBe('viewer');
  });

  it('works without knowledgeBaseId (backwards compat)', async () => {
    (db.execute as Mock).mockResolvedValueOnce([]);

    const role = await resolveRole('user-1', 'cat-1', undefined, 'editor');
    expect(role).toBe('editor');
    // Should only make one execute call (category CTE), skip KB lookup
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});

describe('hasMinimumRole', () => {
  it('viewer >= viewer', () => expect(hasMinimumRole('viewer', 'viewer')).toBe(true));
  it('viewer < editor', () => expect(hasMinimumRole('viewer', 'editor')).toBe(false));
  it('admin >= editor', () => expect(hasMinimumRole('admin', 'editor')).toBe(true));
  it('null never satisfies a role requirement', () => expect(hasMinimumRole(null, 'viewer')).toBe(false));
});

describe('isGlobalAdmin', () => {
  it('recognizes only admin as global admin', () => {
    expect(isGlobalAdmin('admin')).toBe(true);
    expect(isGlobalAdmin('editor')).toBe(false);
    expect(isGlobalAdmin('viewer')).toBe(false);
  });
});

describe('resolveEffectiveKbRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns admin for a global admin without querying role rows', async () => {
    const role = await resolveEffectiveKbRole({
      userId: 'admin-1',
      globalRole: 'admin',
      knowledgeBaseId: 'kb-private',
    });

    expect(role).toBe('admin');
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('returns the explicit KB role when one exists', async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: 'editor' }]);

    const role = await resolveEffectiveKbRole({
      userId: 'user-1',
      globalRole: 'viewer',
      knowledgeBaseId: 'kb-private',
    });

    expect(role).toBe('editor');
  });

  it('returns the global role for an org-visible KB with no explicit role', async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

    const role = await resolveEffectiveKbRole({
      userId: 'user-1',
      globalRole: 'editor',
      knowledgeBaseId: 'kb-org',
    });

    expect(role).toBe('editor');
  });

  it('returns null for a private KB with no explicit role', async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: null }]);

    const role = await resolveEffectiveKbRole({
      userId: 'user-1',
      globalRole: 'editor',
      knowledgeBaseId: 'kb-private',
    });

    expect(role).toBeNull();
  });

  it('returns null when the KB does not exist', async () => {
    (db.execute as Mock).mockResolvedValueOnce([]);

    const role = await resolveEffectiveKbRole({
      userId: 'user-1',
      globalRole: 'viewer',
      knowledgeBaseId: 'missing-kb',
    });

    expect(role).toBeNull();
  });
});

describe('resolveEffectiveCategoryRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the most specific category role when present', async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ role: 'editor', knowledgeBaseId: 'kb-1' }]);

    const role = await resolveEffectiveCategoryRole({
      userId: 'user-1',
      globalRole: 'viewer',
      categoryId: 'cat-1',
      knowledgeBaseId: 'kb-1',
    });

    expect(role).toBe('editor');
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('falls back to KB semantics when no category role exists', async () => {
    (db.execute as Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: 'viewer' }]);

    const role = await resolveEffectiveCategoryRole({
      userId: 'user-1',
      globalRole: 'viewer',
      categoryId: 'cat-1',
      knowledgeBaseId: 'kb-1',
    });

    expect(role).toBe('viewer');
  });
});

describe('canViewKnowledgeBase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when KB role resolution grants visibility', async () => {
    (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

    const visible = await canViewKnowledgeBase({
      userId: 'user-1',
      globalRole: 'viewer',
      knowledgeBaseId: 'kb-1',
    });

    expect(visible).toBe(true);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('returns true for category-only access to a private KB', async () => {
    (db.execute as Mock)
      .mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: null }])
      .mockResolvedValueOnce([{ '?column?': 1 }]);

    const visible = await canViewKnowledgeBase({
      userId: 'user-1',
      globalRole: 'viewer',
      knowledgeBaseId: 'kb-private',
    });

    expect(visible).toBe(true);
  });

  it('returns false when the private KB has no implicit or explicit access', async () => {
    (db.execute as Mock)
      .mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: null }])
      .mockResolvedValueOnce([]);

    const visible = await canViewKnowledgeBase({
      userId: 'user-1',
      globalRole: 'viewer',
      knowledgeBaseId: 'kb-private',
    });

    expect(visible).toBe(false);
  });
});

describe('listVisibleKnowledgeBases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all KBs for global admins', async () => {
    const rows = [
      { id: 'kb-1', name: 'Org', slug: 'org', description: null, defaultAccess: 'org_viewer', createdAt: new Date() },
      { id: 'kb-2', name: 'Private', slug: 'private', description: null, defaultAccess: 'private', createdAt: new Date() },
    ];
    (db.execute as Mock).mockResolvedValueOnce(rows);

    const result = await listVisibleKnowledgeBases({ userId: 'admin-1', globalRole: 'admin' });

    expect(result).toEqual(rows);
  });

  it('returns only KBs visible to non-admin users', async () => {
    const rows = [
      { id: 'kb-1', name: 'Org', slug: 'org', description: null, defaultAccess: 'org_viewer', createdAt: new Date() },
      { id: 'kb-2', name: 'Assigned', slug: 'assigned', description: null, defaultAccess: 'private', createdAt: new Date() },
    ];
    (db.execute as Mock).mockResolvedValueOnce(rows);

    const result = await listVisibleKnowledgeBases({ userId: 'user-1', globalRole: 'viewer' });

    expect(result).toEqual(rows);
  });
});
