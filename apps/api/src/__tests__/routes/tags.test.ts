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

import { app } from '../../app.js';
import { db } from '@dovetail/db';

describe('Tag routes', () => {
  let viewerToken: string;
  let editorToken: string;
  let adminToken: string;
  const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
    adminToken = await makeToken({ sub: 'user-3', role: 'admin' });
  });

  describe('GET /api/knowledge-bases/kb-1/tags', () => {
    it('returns 401 without auth', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app).get('/api/knowledge-bases/kb-1/tags');
      expect(res.status).toBe(401);
    });

    it('returns list of tags', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'Eviction', slug: 'eviction' },
        { id: 'tag-2', name: 'Housing', slug: 'housing' },
      ];
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain(mockTags));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Eviction');
    });
  });

  describe('POST /api/knowledge-bases/kb-1/tags', () => {
    it('returns 403 for viewer', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`)
        .send({ name: 'Test' });
      expect(res.status).toBe(403);
    });

    it('creates a tag for editor', async () => {
      const created = { id: 'tag-new', name: 'Landlord-Tenant', slug: 'landlord-tenant' };
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.insert as Mock).mockReturnValue(createChain([created]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ name: 'Landlord-Tenant' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Landlord-Tenant');
      expect(res.body.slug).toBe('landlord-tenant');
    });

    it('returns 400 for missing name', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/knowledge-bases/kb-1/tags/:id', () => {
    it('returns 403 for non-admin', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1/tags/tag-1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('deletes tag for admin', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.delete as Mock).mockReturnValue(createChain(undefined));

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1/tags/tag-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(204);
    });
  });

  describe('GET /api/knowledge-bases/kb-1/articles/:id/tags', () => {
    it('returns 401 without auth', async () => {
      // resolveKb runs for both /articles and /articles/:id/tags mounts
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app).get('/api/knowledge-bases/kb-1/articles/article-1/tags');
      expect(res.status).toBe(401);
    });

    it('returns tags for article', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'Eviction', slug: 'eviction' },
        { id: 'tag-2', name: 'Housing', slug: 'housing' },
      ];
      // resolveKb runs for /articles mount, then /articles/:id/tags mount, then handler
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain(mockTags));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/articles/article-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('Eviction');
    });
  });

  describe('POST /api/knowledge-bases/kb-1/articles/:id/tags', () => {
    it('returns 403 for viewer', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles/article-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`)
        .send({ tagIds: ['tag-1'] });
      expect(res.status).toBe(403);
    });

    it('assigns tags to article for editor', async () => {
      const tagId = '00000000-0000-4000-8000-000000000001';
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockKb]));
      (db.insert as Mock).mockReturnValue(createChain([
        { articleId: 'article-1', tagId },
      ]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles/article-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ tagIds: [tagId] });

      expect(res.status).toBe(201);
    });

    it('returns 400 for missing tagIds', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/articles/article-1/tags')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/knowledge-bases/kb-1/articles/:id/tags/:tagId', () => {
    it('returns 403 for viewer', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1/articles/article-1/tags/tag-1')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
      expect(res.status).toBe(403);
    });

    it('removes tag from article for editor', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([mockKb]));
      (db.delete as Mock).mockReturnValue(createChain(undefined));

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1/articles/article-1/tags/tag-1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(204);
    });
  });
});
