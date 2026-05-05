import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@dovetail/db', () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from '@dovetail/db';
import { listStaleContent } from '../../services/search.js';

function containsDateChunk(value: unknown, seen = new Set<object>()): boolean {
  if (value instanceof Date) return true;
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsDateChunk(item, seen));
  }

  return Object.values(value).some((item) => containsDateChunk(item, seen));
}

describe('listStaleContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds date filters as timestamp strings for postgres-js raw SQL', async () => {
    (db.execute as Mock)
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);

    await listStaleContent({
      userId: 'user-1',
      globalRole: 'admin',
      knowledgeBaseIds: ['00000000-0000-0000-0000-000000000001'],
      updatedBefore: '2026-05-05T23:59:59.999Z',
      createdBefore: '2026-01-01T00:00:00.000Z',
      page: 1,
      limit: 25,
    });

    expect(db.execute).toHaveBeenCalledTimes(2);
    for (const [query] of (db.execute as Mock).mock.calls) {
      expect(containsDateChunk(query)).toBe(false);
    }
  });
});
