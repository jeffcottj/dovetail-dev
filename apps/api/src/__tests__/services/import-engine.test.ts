import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { ImportEngine } from '../../services/import/import-engine.js';

describe('ImportEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can be instantiated with options', () => {
    const engine = new ImportEngine({
      extractDir: '/tmp/test',
      userId: 'user-1',
      defaultStatus: 'draft',
      jobId: 'job-1',
    });
    expect(engine).toBeDefined();
  });
});
