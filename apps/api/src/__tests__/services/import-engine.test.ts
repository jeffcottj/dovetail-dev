import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';

vi.mock('node:fs/promises');

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

vi.mock('../../utils/storage.js', () => ({
  getUploadsDir: () => '/tmp/uploads',
  ensureDir: vi.fn(),
  copyFile: vi.fn(),
}));

import { db } from '@dovetail/db';
import { ImportEngine } from '../../services/import/import-engine.js';

/** Helper: build a chainable mock that records method calls and resolves with `finalValue` */
function chainMock(finalValue: any = []) {
  const chain: any = {};
  for (const method of ['from', 'where', 'set', 'values', 'returning', 'on', 'onConflictDoNothing']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  // The terminal call (returning / where at the end of a select) resolves to the value
  chain.returning.mockResolvedValue(finalValue);
  // For select chains, making the chain itself thenable so `await db.select().from().where()` works
  chain.then = (resolve: any) => resolve(finalValue);
  return chain;
}

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

  it('skips duplicate articles with same slug and category instead of inserting', async () => {
    // --- Arrange ---
    // data.json format: { articles: { "<id>": { title, code, index, tags } } }
    // code format: "parentId-childId--slug"  (parentChain derived from prefix)
    // We need a parent article (top-level category) and a child article under it.
    const fakeDataJson = JSON.stringify({
      articles: {
        '100': { title: 'Test Category', code: '100--test-category', index: '0', tags: [] },
        '101': { title: 'Test Article', code: '100-101--test-article', index: '1', tags: [] },
      },
    });

    // Mock fs.readFile: return fake data.json, throw for everything else (HTML files)
    const mockedReadFile = vi.mocked(fs.readFile);
    mockedReadFile.mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('data.json')) return fakeDataJson;
      throw new Error('ENOENT');
    });

    // Mock fs.readdir to throw (no attachments directory)
    const mockedReaddir = vi.mocked(fs.readdir);
    mockedReaddir.mockRejectedValue(new Error('ENOENT'));

    // --- Set up db mock chains ---
    const mockedDb = vi.mocked(db);

    // Track call order to return different values for different operations:
    //
    // createCategories for '100' (top-level):
    //   1. db.select() -> categories dedup check -> [] (not found)
    //   2. db.insert() -> create category -> [{ id: 'cat-100' }]
    //
    // createCategories for '101' (child of '100'):
    //   3. db.select() -> categories dedup check -> [] (not found)
    //   4. db.insert() -> create category -> [{ id: 'cat-101' }]
    //
    // importArticle for '100' (top-level article placed in its own category):
    //   5. db.select() -> article dedup check -> [{ id: 'existing-1' }] (DUPLICATE!)
    //   — error thrown, article skipped
    //
    // importArticle for '101':
    //   6. db.select() -> article dedup check -> [{ id: 'existing-2' }] (DUPLICATE!)
    //   — error thrown, article skipped

    // update always returns a simple chain (for importJobs progress updates)
    const updateChain = chainMock();
    (mockedDb.update as any).mockReturnValue(updateChain);

    // select: category dedup checks return empty, article dedup checks return existing
    let selectCallCount = 0;
    (mockedDb.select as any).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount <= 2) {
        // Category dedup checks (calls 1-2) — no existing categories
        return chainMock([]);
      }
      // Article dedup checks (calls 3+) — articles already exist!
      return chainMock([{ id: 'existing-article' }]);
    });

    // insert: category inserts succeed
    let insertCallCount = 0;
    (mockedDb.insert as any).mockImplementation(() => {
      insertCallCount++;
      return chainMock([{ id: `cat-${insertCallCount}` }]);
    });

    // --- Act ---
    const engine = new ImportEngine({
      extractDir: '/tmp/test-import',
      userId: 'user-1',
      defaultStatus: 'draft',
      jobId: 'job-1',
    });

    const events: any[] = [];
    engine.onProgress((e) => events.push(e));

    await engine.run();

    // --- Assert ---
    // The engine should have emitted error events for duplicate articles
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    expect(errorEvents.some((e) => e.message.includes('Duplicate article skipped'))).toBe(true);

    // The complete event should show 0 imported, errors > 0
    const completeEvent = events.find((e) => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent.imported).toBe(0);
    expect(completeEvent.errors).toBe(errorEvents.length);
  });
});
