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
import { resolveRole, hasMinimumRole } from '../../services/permissions.js';

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
});
