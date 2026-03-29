import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../../helpers/token.js';

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

import { app } from '../../../app.js';
import { adminActivityEvents, db } from '@dovetail/db';
import { buildAdminActivityInsert } from '../../../services/admin-activity.js';

describe('Admin user routes', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  describe('GET /api/admin/users', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .get('/api/admin/users')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns paginated list of users', async () => {
      const mockUsers = [
        { id: 'u1', email: 'a@b.com', name: 'Alice', role: 'viewer', provider: 'google', createdAt: new Date() },
      ];
      // First call: count query, second call: data query
      (db.select as Mock)
        .mockReturnValueOnce(createChain([{ count: 1 }]))
        .mockReturnValueOnce(createChain(mockUsers));

      const res = await supertest(app)
        .get('/api/admin/users')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].name).toBe('Alice');
    });
  });

  describe('PATCH /api/admin/users/:id', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .patch('/api/admin/users/u1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ role: 'editor' });
      expect(res.status).toBe(403);
    });

    it('updates user role', async () => {
      const updated = { id: 'u1', email: 'a@b.com', name: 'Alice', role: 'editor', provider: 'google', createdAt: new Date() };
      (db.update as Mock).mockReturnValue(createChain([updated]));
      const activityInsert = createChain([{ id: 'evt-1' }]);
      (db.insert as Mock).mockReturnValueOnce(activityInsert);

      const res = await supertest(app)
        .patch('/api/admin/users/u1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ role: 'editor' });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('editor');
      expect(db.insert).toHaveBeenCalledWith(adminActivityEvents);
      expect(activityInsert.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'user.role_changed',
        actorId: 'admin-1',
        subjectId: updated.id,
        subjectLabel: updated.name,
        metadata: { role: updated.role },
      }));
    });

    it('returns 404 when user not found', async () => {
      (db.update as Mock).mockReturnValue(createChain([]));

      const res = await supertest(app)
        .patch('/api/admin/users/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ role: 'editor' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid role', async () => {
      const res = await supertest(app)
        .patch('/api/admin/users/u1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ role: 'superadmin' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/users/:id/category-roles', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .get('/api/admin/users/u1/category-roles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns category role overrides for user', async () => {
      const mockRoles = [
        { categoryId: 'cat-1', categoryName: 'Employment Law', role: 'editor' },
        { categoryId: 'cat-2', categoryName: 'Housing', role: 'admin' },
      ];
      (db.select as Mock).mockReturnValueOnce(createChain(mockRoles));

      const res = await supertest(app)
        .get('/api/admin/users/u1/category-roles')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.categoryRoles).toHaveLength(2);
      expect(res.body.categoryRoles[0].categoryName).toBe('Employment Law');
      expect(res.body.categoryRoles[1].role).toBe('admin');
    });

    it('returns empty array when user has no overrides', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([]));

      const res = await supertest(app)
        .get('/api/admin/users/u1/category-roles')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.categoryRoles).toEqual([]);
    });
  });

  describe('POST /api/admin/users/:id/category-roles', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .post('/api/admin/users/u1/category-roles')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ categoryId: 'cat-1', role: 'editor' });
      expect(res.status).toBe(403);
    });

    it('assigns category role', async () => {
      const categoryId = '00000000-0000-4000-8000-000000000001';
      const created = { userId: 'u1', categoryId, role: 'editor' };
      (db.insert as Mock).mockReturnValue(createChain([created]));

      const res = await supertest(app)
        .post('/api/admin/users/u1/category-roles')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ categoryId, role: 'editor' });

      expect(res.status).toBe(201);
      expect(res.body.categoryId).toBe(categoryId);
    });
  });

  describe('DELETE /api/admin/users/:id/category-roles/:categoryId', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .delete('/api/admin/users/u1/category-roles/cat-1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('removes category role', async () => {
      (db.delete as Mock).mockReturnValue(createChain(undefined));

      const res = await supertest(app)
        .delete('/api/admin/users/u1/category-roles/cat-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(204);
    });
  });
});
