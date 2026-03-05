import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@dovetail/db', () => ({
  db: { execute: vi.fn() },
}));

import { resolveRole, hasMinimumRole } from '../../services/permissions.js';
import { db } from '@dovetail/db';

describe('resolveRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns global role when no category override exists', async () => {
    (db.execute as Mock).mockResolvedValue([]);
    const role = await resolveRole('user-1', 'cat-1', 'viewer');
    expect(role).toBe('viewer');
  });

  it('returns category role when exact match exists', async () => {
    (db.execute as Mock).mockResolvedValue([{ role: 'editor' }]);
    const role = await resolveRole('user-1', 'cat-1', 'viewer');
    expect(role).toBe('editor');
  });

  it('returns the most specific (deepest) category role', async () => {
    (db.execute as Mock).mockResolvedValue([{ role: 'admin' }]);
    const role = await resolveRole('user-1', 'cat-child', 'viewer');
    expect(role).toBe('admin');
  });
});

describe('hasMinimumRole', () => {
  it('viewer meets viewer requirement', () => {
    expect(hasMinimumRole('viewer', 'viewer')).toBe(true);
  });
  it('viewer does not meet editor requirement', () => {
    expect(hasMinimumRole('viewer', 'editor')).toBe(false);
  });
  it('admin meets editor requirement', () => {
    expect(hasMinimumRole('admin', 'editor')).toBe(true);
  });
});
