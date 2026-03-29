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
import { adminActivityEvents, db } from '@dovetail/db';
import { resolveCategoryPath, buildCategoryPath } from '../../utils/category-path.js';
import { buildAdminActivityInsert } from '../../services/admin-activity.js';

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

const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };

describe('Article routes', () => {
  let viewerToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
  });

  describe('GET /api/knowledge-bases/kb-1/articles', () => {
    it('returns 401 without auth', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app).get('/api/knowledge-bases/kb-1/articles');
      expect(res.status).toBe(401);
    });

    it('returns paginated list of articles', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([{ count: 1 }]))
        .mockReturnValueOnce(createChain([mockArticle]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/articles?page=1&limit=10')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.page).toBe(1);
      expect(res.body.total).toBe(1);
    });
  });

  describe('GET /api/knowledge-bases/kb-1/articles/:id', () => {
    it('returns a single article', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockArticle]));

      const res = await supertest(app)
        .get(`/api/knowledge-bases/kb-1/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ART_ID);
    });

    it('returns 404 when not found', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/articles/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/knowledge-bases/kb-1/articles/by-path/*', () => {
    it('returns article by category path and slug', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (resolveCategoryPath as Mock).mockResolvedValueOnce(CAT_ID);
      (db.select as Mock).mockReturnValueOnce(createChain([mockArticle]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/articles/by-path/housing/test-article')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('test-article');
    });
  });

  describe('POST /api/knowledge-bases/kb-1/articles', () => {
    it('returns 403 for viewer', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`)
        .send({ title: 'Test', categoryId: CAT_ID, content: {} });
      expect(res.status).toBe(403);
    });

    it('creates a draft article for editor', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.execute as Mock).mockResolvedValue([]);
      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const createArticleInsert = createChain([mockArticle]);
        activityInsert = createChain([{ id: 'evt-article-create' }]);
        const tx = {
          select: vi.fn().mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }])),
          insert: vi.fn()
            .mockReturnValueOnce(createArticleInsert)
            .mockReturnValueOnce(activityInsert),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Test Article', categoryId: CAT_ID, content: {} });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Article');
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'article.created',
        actorId: USER_ID,
        knowledgeBaseId: 'kb-1',
        subjectId: ART_ID,
        subjectLabel: 'Test Article',
        metadata: { articleId: ART_ID },
      }));
    });

    it('includes categoryPath in the response', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.execute as Mock).mockResolvedValue([]);
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn().mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }])),
          insert: vi.fn()
            .mockReturnValueOnce(createChain([mockArticle]))
            .mockReturnValueOnce(createChain([{ id: 'evt-article-create' }])),
        };
        return fn(tx);
      });
      (buildCategoryPath as Mock).mockResolvedValueOnce(['housing', 'rental']);

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Test Article', categoryId: CAT_ID, content: {} });

      expect(res.status).toBe(201);
      expect(res.body.categoryPath).toEqual(['housing', 'rental']);
      expect(buildCategoryPath).toHaveBeenCalledWith(CAT_ID);
    });

    it('returns 400 for missing title', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ categoryId: CAT_ID });
      expect(res.status).toBe(400);
    });

    it('returns 404 when the destination category belongs to another knowledge base', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
      };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        tx = {
          select: vi.fn().mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-2' }])),
          insert: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Test Article', categoryId: CAT_ID, content: {} });

      expect(res.status).toBe(404);
      expect(tx!.insert).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/knowledge-bases/kb-1/articles/:id', () => {
    it('updates article and creates version', async () => {
      const nextCategoryId = '00000000-0000-4000-8000-000000000002';
      const updated = { ...mockArticle, title: 'Updated Title', categoryId: nextCategoryId };
      let activityInsert: ReturnType<typeof createChain>;

      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const versionInsert = createChain([]);
        activityInsert = createChain([{ id: 'evt-article-edit' }]);
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockArticle]))  // fetch current article
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }]))  // get category KB
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }]))  // destination category KB
            .mockReturnValueOnce(createChain([{ max: 0 }]))   // max version
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }])), // get updated category KB
          insert: vi.fn()
            .mockReturnValueOnce(versionInsert)
            .mockReturnValueOnce(activityInsert), // insert version, then activity event
          update: vi.fn().mockReturnValue(createChain([updated])), // update article
        };
        return fn(tx);
      });

      // Mock resolveRole's db.execute call
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .patch(`/api/knowledge-bases/kb-1/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Updated Title', categoryId: nextCategoryId });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'article.edited',
        actorId: USER_ID,
        knowledgeBaseId: 'kb-1',
        subjectId: ART_ID,
        subjectLabel: 'Updated Title',
        metadata: { articleId: ART_ID },
      }));
    });

    it('returns 404 when article not found', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

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
        .patch('/api/knowledge-bases/kb-1/articles/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('returns 404 when the current article belongs to another knowledge base', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockArticle]))
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-2' }])),
          insert: vi.fn(),
          update: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .patch(`/api/knowledge-bases/kb-1/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
      expect(tx!.insert).not.toHaveBeenCalled();
      expect(tx!.update).not.toHaveBeenCalled();
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('returns 404 when the article disappears before the update returns', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const versionInsert = createChain([]);
        activityInsert = createChain([{ id: 'evt-article-edit' }]);
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockArticle]))
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }]))
            .mockReturnValueOnce(createChain([{ max: 0 }])),
          insert: vi.fn()
            .mockReturnValueOnce(versionInsert)
            .mockReturnValueOnce(activityInsert),
          update: vi.fn().mockReturnValue(createChain([])),
        };
        return fn(tx);
      });
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .patch(`/api/knowledge-bases/kb-1/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(404);
      expect(activityInsert!.values).not.toHaveBeenCalled();
    });

    it('returns 404 when moving an article to a category from another knowledge base', async () => {
      const nextCategoryId = '00000000-0000-4000-8000-000000000002';
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockArticle]))
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }]))
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-2' }])),
          insert: vi.fn(),
          update: vi.fn(),
        };
        return fn(tx);
      });
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .patch(`/api/knowledge-bases/kb-1/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ categoryId: nextCategoryId });

      expect(res.status).toBe(404);
      expect(tx!.insert).not.toHaveBeenCalled();
      expect(tx!.update).not.toHaveBeenCalled();
    });

    it('returns the current article without versioning or activity for a no-op patch', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockArticle]))
            .mockReturnValueOnce(createChain([{ knowledgeBaseId: 'kb-1' }])),
          insert: vi.fn(),
          update: vi.fn(),
        };
        return fn(tx);
      });
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .patch(`/api/knowledge-bases/kb-1/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ title: mockArticle.title, categoryId: mockArticle.categoryId, content: mockArticle.content });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ART_ID);
      expect(tx!.insert).not.toHaveBeenCalled();
      expect(tx!.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/knowledge-bases/kb-1/articles/:id', () => {
    it('archives article (soft delete)', async () => {
      const archived = { ...mockArticle, status: 'archived' };
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.update as Mock).mockReturnValue(createChain([archived]));

      const res = await supertest(app)
        .delete(`/api/knowledge-bases/kb-1/articles/${ART_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('archived');
    });
  });

  describe('POST /api/knowledge-bases/kb-1/articles/:id/publish', () => {
    it('publishes a draft article', async () => {
      const published = { ...mockArticle, status: 'published', publishedAt: new Date() };
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.update as Mock).mockReturnValue(createChain([published]));

      const res = await supertest(app)
        .post(`/api/knowledge-bases/kb-1/articles/${ART_ID}/publish`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('published');
    });

    it('returns 404 when article not found', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.update as Mock).mockReturnValue(createChain([]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles/nonexistent/publish')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(404);
    });
  });
});
