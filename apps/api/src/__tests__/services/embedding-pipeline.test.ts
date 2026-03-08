import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Partial mock — preserves schema exports, replaces only db
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

// Mock the embeddings service
vi.mock('../../services/embeddings.js', () => ({
  createEmbeddingProvider: vi.fn(() => ({
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedMany: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]),
  })),
}));

import { db } from '@dovetail/db';
import { createChain, mockTransaction } from '../helpers/db-mock.js';

describe('chunkText', () => {
  it('returns single chunk for short text', async () => {
    const { chunkText } = await import('../../services/embedding-pipeline.js');
    const chunks = chunkText('Short text');
    expect(chunks).toEqual(['Short text']);
  });

  it('splits long text into overlapping chunks', async () => {
    const { chunkText } = await import('../../services/embedding-pipeline.js');
    const text = 'a'.repeat(5000);
    const chunks = chunkText(text, 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should be at most maxChars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }

    // Chunks should overlap — second chunk should start 200 chars before end of first
    expect(chunks[0].length).toBe(2000);
    expect(chunks[1].slice(0, 200)).toBe(chunks[0].slice(-200));
  });

  it('returns empty array for empty text', async () => {
    const { chunkText } = await import('../../services/embedding-pipeline.js');
    const chunks = chunkText('');
    expect(chunks).toEqual(['']);
  });

  it('handles text exactly at maxChars boundary', async () => {
    const { chunkText } = await import('../../services/embedding-pipeline.js');
    const text = 'x'.repeat(2000);
    const chunks = chunkText(text, 2000, 200);
    expect(chunks).toEqual([text]);
  });
});

describe('generateEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing if article not found', async () => {
    const selectChain = createChain([]);
    (db.select as Mock).mockReturnValue(selectChain);

    const { generateEmbeddings } = await import('../../services/embedding-pipeline.js');
    await generateEmbeddings('nonexistent-id');

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('does nothing if article has empty content', async () => {
    const selectChain = createChain([{
      id: 'art-1',
      content: {},
    }]);
    (db.select as Mock).mockReturnValue(selectChain);

    const { generateEmbeddings } = await import('../../services/embedding-pipeline.js');
    await generateEmbeddings('art-1');

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('generates and stores embeddings for article with content', async () => {
    const article = {
      id: 'art-1',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Some legal content about tenant rights.' }] },
        ],
      },
    };

    const selectChain = createChain([article]);
    (db.select as Mock).mockReturnValue(selectChain);

    // Set up transaction mock
    const txDeleteChain = createChain([]);
    const txInsertChain = createChain([]);
    (db.transaction as Mock).mockImplementation(async (fn: (tx: any) => Promise<void>) => {
      const tx = {
        delete: vi.fn().mockReturnValue(txDeleteChain),
        insert: vi.fn().mockReturnValue(txInsertChain),
      };
      return fn(tx);
    });

    const { generateEmbeddings } = await import('../../services/embedding-pipeline.js');
    await generateEmbeddings('art-1');

    expect(db.transaction).toHaveBeenCalledOnce();
  });
});
