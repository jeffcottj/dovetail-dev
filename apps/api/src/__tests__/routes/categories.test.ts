import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../helpers/token.js';

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

import { app } from '../../app.js';
import { db } from '@dovetail/db';

describe('Category routes', () => {
  let viewerToken: string;
  let editorToken: string;
  let adminToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
    adminToken = await makeToken({ sub: 'user-3', role: 'admin' });
  });

  describe('GET /api/categories', () => {
    it('returns 401 without auth', async () => {
      const res = await supertest(app).get('/api/categories');
      expect(res.status).toBe(401);
    });

    it('returns list of categories', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'General', slug: 'general', parentId: null, createdAt: new Date() },
      ];
      (db.select as Mock).mockReturnValue(createChain(mockCategories));

      const res = await supertest(app)
        .get('/api/categories')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('General');
    });
  });

  describe('POST /api/categories', () => {
    it('returns 403 for viewer', async () => {
      const res = await supertest(app)
        .post('/api/categories')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`)
        .send({ name: 'Test' });
      expect(res.status).toBe(403);
    });

    it('creates a category for editor', async () => {
      const created = { id: 'cat-new', name: 'Housing Law', slug: 'housing-law', parentId: null, createdAt: new Date() };
      (db.insert as Mock).mockReturnValue(createChain([created]));

      const res = await supertest(app)
        .post('/api/categories')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ name: 'Housing Law' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Housing Law');
      expect(res.body.slug).toBe('housing-law');
    });

    it('returns 400 for missing name', async () => {
      const res = await supertest(app)
        .post('/api/categories')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/categories/:id', () => {
    it('updates a category for editor', async () => {
      const updated = { id: 'cat-1', name: 'Updated', slug: 'updated', parentId: null, createdAt: new Date() };
      (db.update as Mock).mockReturnValue(createChain([updated]));

      const res = await supertest(app)
        .patch('/api/categories/cat-1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('returns 404 when category not found', async () => {
      (db.update as Mock).mockReturnValue(createChain([]));

      const res = await supertest(app)
        .patch('/api/categories/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .delete('/api/categories/cat-1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 409 when category has children', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([{ count: 1 }]));

      const res = await supertest(app)
        .delete('/api/categories/cat-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('returns 409 when category has articles', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([{ count: 0 }]))
        .mockReturnValueOnce(createChain([{ count: 1 }]));

      const res = await supertest(app)
        .delete('/api/categories/cat-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('deletes category when no children or articles', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([{ count: 0 }]))
        .mockReturnValueOnce(createChain([{ count: 0 }]));
      (db.delete as Mock).mockReturnValue(createChain(undefined));

      const res = await supertest(app)
        .delete('/api/categories/cat-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(204);
    });
  });
});
