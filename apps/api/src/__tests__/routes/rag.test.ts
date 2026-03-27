import { createHash } from 'node:crypto';
import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../helpers/db-mock.js';

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

vi.mock('../../utils/category-path.js', () => ({
  resolveCategoryPath: vi.fn(),
  buildCategoryPath: vi.fn().mockResolvedValue(['mock-category']),
}));

// Mock embedding service
vi.mock('../../services/embeddings.js', () => ({
  createEmbeddingProvider: vi.fn(() => ({
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedMany: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  })),
}));

import { app } from '../../app.js';
import { db } from '@dovetail/db';

const TEST_API_KEY = 'test-api-key-for-rag';
const TEST_KEY_HASH = createHash('sha256').update(TEST_API_KEY).digest('hex');
const KEY_ID = '00000000-0000-4000-8000-000000000099';
const KB_ID = '00000000-0000-4000-8000-000000000001';
const KB_UNAUTHORIZED_ID = '00000000-0000-4000-8000-000000000002';

function mockValidApiKey() {
  const chain = createChain([{
    id: KEY_ID,
    name: 'RAG Key',
    keyHash: TEST_KEY_HASH,
    createdBy: 'admin-1',
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
  }]);
  (db.select as Mock).mockReturnValueOnce(chain);

  // Mock the fire-and-forget lastUsedAt update
  const updateChain = createChain([]);
  (db.update as Mock).mockReturnValueOnce(updateChain);

  // Mock KB associations for the API key
  const kbChain = createChain([{ knowledgeBaseId: KB_ID }]);
  (db.select as Mock).mockReturnValueOnce(kbChain);
}

describe('RAG search endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/rag/search', () => {
    it('returns 401 without API key', async () => {
      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .send({ query: 'what is tenant law' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when query is missing', async () => {
      mockValidApiKey();
      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ knowledgeBaseIds: [KB_ID] });
      expect(res.status).toBe(400);
    });

    it('returns 400 when knowledgeBaseIds is missing', async () => {
      mockValidApiKey();
      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns 403 when API key lacks access to requested KB', async () => {
      mockValidApiKey();
      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'test', knowledgeBaseIds: [KB_UNAUTHORIZED_ID] });
      expect(res.status).toBe(403);
    });

    it('returns formatted chunks for a valid query', async () => {
      mockValidApiKey();

      // Mock the pgvector similarity search
      (db.execute as Mock).mockResolvedValueOnce([
        {
          article_id: '00000000-0000-4000-8000-000000000010',
          chunk_text: 'Tenants have the right to...',
          chunk_index: 0,
          similarity: '0.94',
          title: 'Notice Requirements',
          slug: 'notice-requirements',
          category_id: 'cat-1',
        },
        {
          article_id: '00000000-0000-4000-8000-000000000020',
          chunk_text: 'Under Maryland law, landlords must...',
          chunk_index: 1,
          similarity: '0.87',
          title: 'Landlord Obligations',
          slug: 'landlord-obligations',
          category_id: 'cat-2',
        },
      ]);

      // For each result: category lookup + KB lookup
      (db.select as Mock)
        .mockReturnValueOnce(createChain([{ knowledgeBaseId: KB_ID }]))  // cat lookup for result 1
        .mockReturnValueOnce(createChain([{ slug: 'default' }]))          // KB lookup for result 1
        .mockReturnValueOnce(createChain([{ knowledgeBaseId: KB_ID }]))  // cat lookup for result 2
        .mockReturnValueOnce(createChain([{ slug: 'default' }]));         // KB lookup for result 2

      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'what is tenant law', limit: 5, knowledgeBaseIds: [KB_ID] });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toEqual({
        articleId: '00000000-0000-4000-8000-000000000010',
        articleTitle: 'Notice Requirements',
        articleUrl: '/kb/default/articles/mock-category/notice-requirements',
        categoryPath: ['mock-category'],
        chunkText: 'Tenants have the right to...',
        score: 0.94,
      });
      expect(res.body.results[1].score).toBe(0.87);
    });

    it('returns empty results when no matches', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'completely unrelated query', knowledgeBaseIds: [KB_ID] });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });

    it('supports categoryIds filter', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([
        {
          article_id: '00000000-0000-4000-8000-000000000010',
          chunk_text: 'Some chunk',
          chunk_index: 0,
          similarity: '0.90',
          title: 'Article Title',
          slug: 'article-title',
          category_id: 'cat-1',
        },
      ]);

      // For each result: category lookup + KB lookup
      (db.select as Mock)
        .mockReturnValueOnce(createChain([{ knowledgeBaseId: KB_ID }]))
        .mockReturnValueOnce(createChain([{ slug: 'default' }]));

      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          query: 'tenant law',
          knowledgeBaseIds: [KB_ID],
          categoryIds: ['00000000-0000-4000-8000-000000000001'],
        });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
    });

    it('uses default limit of 5', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'test', knowledgeBaseIds: [KB_ID] });

      expect(res.status).toBe(200);
      // Verify db.execute was called (query embedding + pgvector search)
      expect(db.execute).toHaveBeenCalled();
    });
  });
});
