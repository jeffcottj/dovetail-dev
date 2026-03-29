import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../helpers/token.js';

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

// Mock embedding service for semantic search tests
vi.mock('../../services/embeddings.js', () => ({
  createEmbeddingProvider: vi.fn(() => ({
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedMany: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  })),
}));

import { app } from '../../app.js';
import { db } from '@dovetail/db';

const CAT_ID = '00000000-0000-4000-8000-000000000001';
const ART_ID_1 = '00000000-0000-4000-8000-000000000010';
const ART_ID_2 = '00000000-0000-4000-8000-000000000020';

const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };

const mockSearchResult = {
  id: ART_ID_1,
  title: 'Legal Aid Overview',
  slug: 'legal-aid-overview',
  categoryId: CAT_ID,
  authorId: 'user-1',
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  rank: 0.5,
};

describe('Search routes', () => {
  let viewerToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
  });

  describe('GET /api/knowledge-bases/kb-1/search (fulltext — default)', () => {
    it('returns 401 without auth', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      const res = await supertest(app).get('/api/knowledge-bases/kb-1/search?q=legal');
      expect(res.status).toBe(401);
    });

    it('returns 400 when q param is missing', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
      expect(res.status).toBe(400);
    });

    it('returns search results for a query', async () => {
      const countChain = createChain([{ count: 1 }]);
      const dataChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=legal')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Legal Aid Overview');
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
    });

    it('supports pagination', async () => {
      const countChain = createChain([{ count: 50 }]);
      const dataChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=legal&page=2&limit=10')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
    });

    it('supports categoryId filter', async () => {
      const countChain = createChain([{ count: 1 }]);
      const dataChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get(`/api/knowledge-bases/kb-1/search?q=legal&categoryId=${CAT_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('accepts mode=fulltext explicitly', async () => {
      const countChain = createChain([{ count: 1 }]);
      const dataChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=legal&mode=fulltext')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/knowledge-bases/kb-1/search?mode=semantic', () => {
    it('returns semantic search results', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      // Semantic search uses db.execute for raw SQL
      (db.execute as Mock).mockResolvedValue([
        {
          article_id: ART_ID_1,
          title: 'Legal Aid Overview',
          slug: 'legal-aid-overview',
          category_id: CAT_ID,
          author_id: 'user-1',
          status: 'published',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chunk_text: 'Some relevant chunk',
          similarity: 0.92,
        },
      ]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=legal&mode=semantic')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].similarity).toBeDefined();
    });

    it('returns empty results when no embeddings match', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=nonexistent&mode=semantic')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/knowledge-bases/kb-1/search?mode=hybrid', () => {
    it('returns merged results from fulltext and semantic', async () => {
      // Fulltext: count + results
      const countChain = createChain([{ count: 1 }]);
      const fulltextChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(fulltextChain);

      // Semantic results
      (db.execute as Mock).mockResolvedValue([
        {
          article_id: ART_ID_2,
          title: 'Tenant Rights',
          slug: 'tenant-rights',
          category_id: CAT_ID,
          author_id: 'user-1',
          status: 'published',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chunk_text: 'About tenant rights',
          similarity: 0.85,
        },
      ]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=legal&mode=hybrid')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      // Should have results from both sources (deduplicated)
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('deduplicates articles appearing in both result sets', async () => {
      // Same article in both fulltext and semantic
      const countChain = createChain([{ count: 1 }]);
      const fulltextChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(fulltextChain);

      (db.execute as Mock).mockResolvedValue([
        {
          article_id: ART_ID_1, // Same as fulltext result
          title: 'Legal Aid Overview',
          slug: 'legal-aid-overview',
          category_id: CAT_ID,
          author_id: 'user-1',
          status: 'published',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          chunk_text: 'Some chunk',
          similarity: 0.90,
        },
      ]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=legal&mode=hybrid')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      // Should deduplicate — only 1 article
      const ids = res.body.data.map((r: any) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('GET /api/knowledge-bases/kb-1/search invalid mode', () => {
    it('returns 400 for unknown mode', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/search?q=legal&mode=invalid')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(400);
    });
  });
});
