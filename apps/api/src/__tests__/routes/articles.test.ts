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
  buildCategoryPath: vi.fn(),
}));

import { app } from '../../app.js';
import { db } from '@dovetail/db';
import { resolveCategoryPath, buildCategoryPath } from '../../utils/category-path.js';

const CAT_ID = '00000000-0000-4000-8000-000000000001';
const ART_ID = '00000000-0000-4000-8000-000000000010';
const USER_ID = 'user-2';

const mockArticle = {
  id: ART_ID,
  title: 'Test Article',
  slug: 'test-article',
  categoryId: CAT_ID,
  authorId: USER_ID,
  content: { type: 'doc', content: [] },
  status: 'draft' as const,
  plainText: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: null,
};

describe('Article routes', () => {
  let viewerToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
  });

  describe('GET /api/articles', () => {
    it('returns 401 without auth', async () => {
      const res = await supertest(app).get('/api/articles');
      expect(res.status).toBe(401);
    });

    it('returns paginated list of articles', async () => {
      const countChain = createChain([{ count: 1 }]);
      const dataChain = createChain([mockArticle]);
      (db.select as Mock)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get('/api/articles?page=1&limit=10')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.page).toBe(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/articles/:id', () => {
    it('returns a single article', async () => {
      (db.select as Mock).mockReturnValue(createChain([mockArticle]));

      const res = await supertest(app)
        .get(`/api/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ART_ID);
    });

    it('returns 404 when not found', async () => {
      (db.select as Mock).mockReturnValue(createChain([]));

      const res = await supertest(app)
        .get('/api/articles/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/articles/by-path/*', () => {
    it('returns article by category path and slug', async () => {
      (resolveCategoryPath as Mock).mockResolvedValueOnce(CAT_ID);
      (db.select as Mock).mockReturnValue(createChain([mockArticle]));

      const res = await supertest(app)
        .get('/api/articles/by-path/housing/test-article')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('test-article');
    });
  });

  describe('POST /api/articles', () => {
    it('returns 403 for viewer', async () => {
      const res = await supertest(app)
        .post('/api/articles')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`)
        .send({ title: 'Test', categoryId: CAT_ID, content: {} });
      expect(res.status).toBe(403);
    });

    it('creates a draft article for editor', async () => {
      (db.insert as Mock).mockReturnValue(createChain([mockArticle]));

      const res = await supertest(app)
        .post('/api/articles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Test Article', categoryId: CAT_ID, content: {} });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Article');
    });

    it('includes categoryPath in the response', async () => {
      (db.insert as Mock).mockReturnValue(createChain([mockArticle]));
      (buildCategoryPath as Mock).mockResolvedValueOnce(['housing', 'rental']);

      const res = await supertest(app)
        .post('/api/articles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Test Article', categoryId: CAT_ID, content: {} });

      expect(res.status).toBe(201);
      expect(res.body.categoryPath).toEqual(['housing', 'rental']);
      expect(buildCategoryPath).toHaveBeenCalledWith(CAT_ID);
    });

    it('returns 400 for missing title', async () => {
      const res = await supertest(app)
        .post('/api/articles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ categoryId: CAT_ID });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/articles/:id', () => {
    it('updates article and creates version', async () => {
      const updated = { ...mockArticle, title: 'Updated Title' };

      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockArticle]))  // fetch current
            .mockReturnValueOnce(createChain([{ max: 0 }])),   // max version
          insert: vi.fn().mockReturnValue(createChain([])),     // insert version
          update: vi.fn().mockReturnValue(createChain([updated])), // update article
        };
        return fn(tx);
      });

      // Mock resolveRole's db.execute call
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .patch(`/api/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
    });

    it('returns 404 when article not found', async () => {
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn().mockReturnValue(createChain([])),
          insert: vi.fn(),
          update: vi.fn(),
        };
        return fn(tx);
      });
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .patch('/api/articles/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/articles/:id', () => {
    it('archives article (soft delete)', async () => {
      const archived = { ...mockArticle, status: 'archived' };
      (db.update as Mock).mockReturnValue(createChain([archived]));

      const res = await supertest(app)
        .delete(`/api/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('archived');
    });
  });

  describe('POST /api/articles/:id/publish', () => {
    it('publishes a draft article', async () => {
      const published = { ...mockArticle, status: 'published', publishedAt: new Date() };
      (db.update as Mock).mockReturnValue(createChain([published]));

      const res = await supertest(app)
        .post(`/api/articles/${ART_ID}/publish`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('published');
    });

    it('returns 404 when article not found', async () => {
      (db.update as Mock).mockReturnValue(createChain([]));

      const res = await supertest(app)
        .post('/api/articles/nonexistent/publish')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(404);
    });
  });
});
