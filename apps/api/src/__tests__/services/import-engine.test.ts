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

vi.mock('../../services/attachment-indexing.js', () => ({
  enqueueAttachmentIndexing: vi.fn(),
}));

vi.mock('../../services/embedding-pipeline.js', () => ({
  generateEmbeddings: vi.fn(),
}));

import { db } from '@dovetail/db';
import { ImportEngine } from '../../services/import/import-engine.js';
import { enqueueAttachmentIndexing } from '../../services/attachment-indexing.js';
import { generateEmbeddings } from '../../services/embedding-pipeline.js';

/** Helper: build a chainable mock that records method calls and resolves with `finalValue` */
function chainMock(finalValue: any = []) {
  const chain: any = {};
  for (const method of ['from', 'where', 'set', 'values', 'returning', 'on', 'onConflictDoNothing', 'limit']) {
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
      knowledgeBaseId: 'kb-1',
    });
    expect(engine).toBeDefined();
  });

  it('imports Flowlu tags, generates article embeddings, and queues attachment indexing', async () => {
    const fakeDataJson = JSON.stringify({
      articles: {
        '100': { title: 'Test Category', code: '100--test-category', index: '0', tags: [] },
        '101': {
          title: 'Test Article',
          code: '100-101--test-article',
          index: '1',
          tags: ['Flowlu Test Tag', 'flowlu test tag', 'Other Tag'],
        },
      },
    });

    const mockedReadFile = vi.mocked(fs.readFile);
    mockedReadFile.mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('data.json')) return fakeDataJson;
      if (String(filePath).endsWith('index.html')) {
        return '<html><body><main><p>marigold import remedy</p></main></body></html>';
      }
      return 'attachment text';
    });

    const mockedReaddir = vi.mocked(fs.readdir);
    mockedReaddir.mockImplementation(async (dirPath: any) => {
      if (String(dirPath).endsWith('/assets/images/101')) return ['notice.txt'] as any;
      throw new Error('ENOENT');
    });

    vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true, size: 42 } as any);

    const mockedDb = vi.mocked(db);
    (mockedDb.update as any).mockReturnValue(chainMock());

    let selectCallCount = 0;
    (mockedDb.select as any).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainMock([]); // category dedupe
      if (selectCallCount === 2) return chainMock([]); // root article dedupe
      if (selectCallCount === 3) return chainMock([]); // child article dedupe
      if (selectCallCount === 4) return chainMock([{ id: 'tag-existing' }]); // first tag exists
      if (selectCallCount === 5) return chainMock([]); // second normalized tag missing
      return chainMock([]);
    });

    let insertCallCount = 0;
    (mockedDb.insert as any).mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) return chainMock([{ id: 'cat-100' }]);
      if (insertCallCount === 2) return chainMock([{ id: 'article-100' }]);
      if (insertCallCount === 3) return chainMock([{ id: 'article-101' }]);
      if (insertCallCount === 4) return chainMock([{ id: 'tag-created' }]);
      return chainMock([{ id: `insert-${insertCallCount}` }]);
    });

    const engine = new ImportEngine({
      extractDir: '/tmp/test-import',
      userId: 'user-1',
      defaultStatus: 'draft',
      jobId: 'job-1',
      knowledgeBaseId: 'kb-1',
    });

    const events: any[] = [];
    engine.onProgress((e) => events.push(e));

    await engine.run();

    expect(events.find((e) => e.type === 'complete')).toMatchObject({ imported: 2, errors: 0 });
    expect(generateEmbeddings).toHaveBeenCalledWith('article-100');
    expect(generateEmbeddings).toHaveBeenCalledWith('article-101');
    expect(enqueueAttachmentIndexing).toHaveBeenCalledTimes(1);

    const valuesCalls = (mockedDb.insert as any).mock.results
      .map((result: any) => result.value?.values?.mock?.calls ?? [])
      .flat(2);
    expect(valuesCalls).toContainEqual({ articleId: 'article-101', tagId: 'tag-existing' });
    expect(valuesCalls).toContainEqual({ name: 'Other Tag', slug: 'other-tag', knowledgeBaseId: 'kb-1' });
    expect(valuesCalls).toContainEqual({ articleId: 'article-101', tagId: 'insert-5' });
  });

  it('skips duplicate articles without creating tags or indexing work for skipped articles', async () => {
    const fakeDataJson = JSON.stringify({
      articles: {
        '100': { title: 'Test Category', code: '100--test-category', index: '0', tags: ['Skipped Tag'] },
      },
    });

    vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('data.json')) return fakeDataJson;
      throw new Error('ENOENT');
    });
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const mockedDb = vi.mocked(db);
    (mockedDb.update as any).mockReturnValue(chainMock());

    let selectCallCount = 0;
    (mockedDb.select as any).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return chainMock([]); // category dedupe
      return chainMock([{ id: 'existing-article' }]); // article dedupe
    });

    let insertCallCount = 0;
    (mockedDb.insert as any).mockImplementation(() => {
      insertCallCount++;
      if (insertCallCount === 1) return chainMock([{ id: 'cat-100' }]);
      return chainMock([{ id: `unexpected-${insertCallCount}` }]);
    });

    const engine = new ImportEngine({
      extractDir: '/tmp/test-import',
      userId: 'user-1',
      defaultStatus: 'draft',
      jobId: 'job-1',
      knowledgeBaseId: 'kb-1',
    });

    const events: any[] = [];
    engine.onProgress((e) => events.push(e));

    await engine.run();

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].message).toContain('Duplicate article skipped');

    const completeEvent = events.find((e) => e.type === 'complete');
    expect(completeEvent).toMatchObject({ imported: 0, errors: 1 });
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(enqueueAttachmentIndexing).not.toHaveBeenCalled();
    expect(insertCallCount).toBe(1);
  });
});
