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
  resolveCategoryPath: vi.fn().mockResolvedValue('cat-1'),
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
const ARTICLE_ID = '00000000-0000-4000-8000-000000000010';
const ATTACHMENT_ID = '00000000-0000-4000-8000-000000000050';

function mockValidApiKey(allowedKbIds = [KB_ID]) {
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
  const kbChain = createChain(allowedKbIds.map((knowledgeBaseId) => ({ knowledgeBaseId })));
  (db.select as Mock).mockReturnValueOnce(kbChain);
}

function mockRagRow(overrides: Record<string, unknown> = {}) {
  return {
    article_id: ARTICLE_ID,
    chunk_text: 'Tenants have the right to...',
    chunk_index: 0,
    similarity: '0.94',
    title: 'Notice Requirements',
    slug: 'notice-requirements',
    category_id: 'cat-1',
    updated_at: '2026-01-01T00:00:00.000Z',
    last_edited_by_id: 'user-1',
    last_edited_by_name: 'Editor One',
    last_edited_by_email: 'editor@example.com',
    knowledge_base_id: KB_ID,
    knowledge_base_name: 'Default',
    knowledge_base_slug: 'default',
    source_type: 'article',
    attachment_id: null,
    attachment_filename: null,
    ...overrides,
  };
}

function mockArticleRow(overrides: Record<string, unknown> = {}) {
  return {
    article_id: ARTICLE_ID,
    title: 'Notice Requirements',
    slug: 'notice-requirements',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    plain_text: 'Tenants have repair remedies.',
    status: 'published',
    category_id: 'cat-1',
    author_id: 'author-1',
    created_at: '2025-12-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    published_at: '2026-01-02T00:00:00.000Z',
    last_edited_by_id: 'user-1',
    last_edited_by_name: 'Editor One',
    last_edited_by_email: 'editor@example.com',
    knowledge_base_id: KB_ID,
    knowledge_base_name: 'Default',
    knowledge_base_slug: 'default',
    ...overrides,
  };
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
        mockRagRow(),
        mockRagRow({
          article_id: '00000000-0000-4000-8000-000000000020',
          chunk_text: 'Under Maryland law, landlords must...',
          chunk_index: 1,
          similarity: '0.87',
          title: 'Landlord Obligations',
          slug: 'landlord-obligations',
          category_id: 'cat-2',
        }),
      ]);

      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'what is tenant law', limit: 5, knowledgeBaseIds: [KB_ID] });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0]).toEqual(expect.objectContaining({
        articleId: '00000000-0000-4000-8000-000000000010',
        articleTitle: 'Notice Requirements',
        articleUrl: '/kb/default/articles/mock-category/notice-requirements',
        categoryPath: ['mock-category'],
        sourceType: 'article',
        attachmentId: null,
        attachmentFilename: null,
        chunkText: 'Tenants have the right to...',
        score: 0.94,
      }));
      expect(res.body.results[1].score).toBe(0.87);
    });

    it('returns attachment source metadata for attachment chunks', async () => {
      mockValidApiKey();

      (db.execute as Mock).mockResolvedValueOnce([
        mockRagRow({
          chunk_text: 'Attachment text about escrow remedies',
          similarity: '0.91',
          source_type: 'attachment',
          attachment_id: ATTACHMENT_ID,
          attachment_filename: 'escrow.pdf',
        }),
      ]);

      const res = await supertest(app)
        .post('/api/v1/rag/search')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'escrow remedies', limit: 5, knowledgeBaseIds: [KB_ID] });

      expect(res.status).toBe(200);
      expect(res.body.results[0]).toEqual(expect.objectContaining({
        sourceType: 'attachment',
        attachmentId: '00000000-0000-4000-8000-000000000050',
        attachmentFilename: 'escrow.pdf',
        chunkText: 'Attachment text about escrow remedies',
      }));
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
        mockRagRow({
          chunk_text: 'Some chunk',
          similarity: '0.90',
          title: 'Article Title',
          slug: 'article-title',
        }),
      ]);

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

  describe('GET /api/v1/rag/knowledge-bases', () => {
    it('returns scoped knowledge bases', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([
        { id: KB_ID, name: 'Default', slug: 'default', description: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ]);

      const res = await supertest(app)
        .get('/api/v1/rag/knowledge-bases')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({ id: KB_ID, name: 'Default', slug: 'default' }),
      ]);
    });

    it('returns an empty list for an API key without KB scope', async () => {
      mockValidApiKey([]);

      const res = await supertest(app)
        .get('/api/v1/rag/knowledge-bases')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(db.execute).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/rag/knowledge-bases/:kbId/categories', () => {
    it('returns categories for an allowed KB with paths', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([
        {
          id: '00000000-0000-4000-8000-000000000011',
          name: 'Housing',
          slug: 'housing',
          parentId: null,
          knowledgeBaseId: KB_ID,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);

      const res = await supertest(app)
        .get(`/api/v1/rag/knowledge-bases/${KB_ID}/categories`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(200);
      expect(res.body[0]).toEqual(expect.objectContaining({
        name: 'Housing',
        path: ['mock-category'],
      }));
    });

    it('returns 403 for categories in a disallowed KB', async () => {
      mockValidApiKey();

      const res = await supertest(app)
        .get(`/api/v1/rag/knowledge-bases/${KB_UNAUTHORIZED_ID}/categories`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/rag/articles/:articleId', () => {
    it('returns a full published article in an allowed KB', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([mockArticleRow()]);

      const res = await supertest(app)
        .get(`/api/v1/rag/articles/${ARTICLE_ID}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        id: ARTICLE_ID,
        title: 'Notice Requirements',
        articleUrl: '/kb/default/articles/mock-category/notice-requirements',
        categoryPath: ['mock-category'],
        lastEditedBy: expect.objectContaining({ email: 'editor@example.com' }),
      }));
    });

    it('returns 404 when the article is not published or not in scope', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get(`/api/v1/rag/articles/${ARTICLE_ID}`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/rag/articles/by-path', () => {
    it('returns a published article by KB slug and article path', async () => {
      mockValidApiKey();
      (db.execute as Mock)
        .mockResolvedValueOnce([{ id: KB_ID }])
        .mockResolvedValueOnce([{ id: ARTICLE_ID }])
        .mockResolvedValueOnce([mockArticleRow()]);

      const res = await supertest(app)
        .get('/api/v1/rag/articles/by-path?knowledgeBaseSlug=default&path=mock-category/notice-requirements')
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        id: ARTICLE_ID,
        articleUrl: '/kb/default/articles/mock-category/notice-requirements',
      }));
    });
  });

  describe('GET /api/v1/rag/articles/:articleId/citations', () => {
    it('returns article and attachment citation chunks', async () => {
      mockValidApiKey();
      (db.execute as Mock)
        .mockResolvedValueOnce([mockArticleRow()])
        .mockResolvedValueOnce([
          {
            sourceType: 'article',
            chunkIndex: 0,
            chunkText: 'Article chunk',
            attachmentId: null,
            attachmentFilename: null,
          },
          {
            sourceType: 'attachment',
            chunkIndex: 0,
            chunkText: 'Attachment chunk',
            attachmentId: ATTACHMENT_ID,
            attachmentFilename: 'escrow.pdf',
          },
        ]);

      const res = await supertest(app)
        .get(`/api/v1/rag/articles/${ARTICLE_ID}/citations`)
        .set('Authorization', `Bearer ${TEST_API_KEY}`);

      expect(res.status).toBe(200);
      expect(res.body.article).toEqual(expect.objectContaining({
        id: ARTICLE_ID,
        url: '/kb/default/articles/mock-category/notice-requirements',
      }));
      expect(res.body.chunks).toEqual([
        expect.objectContaining({ sourceType: 'article', chunkText: 'Article chunk' }),
        expect.objectContaining({ sourceType: 'attachment', attachmentFilename: 'escrow.pdf' }),
      ]);
    });
  });

  describe('POST /api/v1/rag/related-articles', () => {
    it('returns related article suggestions for a query', async () => {
      mockValidApiKey();
      (db.execute as Mock).mockResolvedValueOnce([
        mockRagRow(),
        mockRagRow({ chunk_text: 'Second chunk from same article', similarity: '0.80' }),
      ]);

      const res = await supertest(app)
        .post('/api/v1/rag/related-articles')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'repair remedies', knowledgeBaseIds: [KB_ID], limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0]).toEqual(expect.objectContaining({
        articleId: ARTICLE_ID,
        snippet: 'Tenants have the right to...',
      }));
    });

    it('returns related article suggestions for an article and excludes the source article', async () => {
      mockValidApiKey();
      (db.execute as Mock)
        .mockResolvedValueOnce([mockArticleRow()])
        .mockResolvedValueOnce([
          mockRagRow({
            article_id: '00000000-0000-4000-8000-000000000020',
            title: 'Repairs',
            slug: 'repairs',
          }),
        ]);

      const res = await supertest(app)
        .post('/api/v1/rag/related-articles')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ articleId: ARTICLE_ID, limit: 5 });

      expect(res.status).toBe(200);
      expect(res.body.results[0]).toEqual(expect.objectContaining({
        articleId: '00000000-0000-4000-8000-000000000020',
      }));
    });

    it('returns 400 when neither query nor articleId is provided', async () => {
      mockValidApiKey();

      const res = await supertest(app)
        .post('/api/v1/rag/related-articles')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ limit: 5 });

      expect(res.status).toBe(400);
    });

    it('returns 403 for a disallowed requested KB', async () => {
      mockValidApiKey();

      const res = await supertest(app)
        .post('/api/v1/rag/related-articles')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({ query: 'repair remedies', knowledgeBaseIds: [KB_UNAUTHORIZED_ID] });

      expect(res.status).toBe(403);
    });
  });
});
