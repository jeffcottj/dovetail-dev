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
import { adminActivityEvents, db } from '@dovetail/db';
import { buildAdminActivityInsert } from '../../services/admin-activity.js';

const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };

describe('Knowledge Base routes', () => {
  let viewerToken: string;
  let editorToken: string;
  let adminToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
    adminToken = await makeToken({ sub: 'user-3', role: 'admin' });
  });

  describe('GET /api/knowledge-bases', () => {
    it('returns 401 without auth', async () => {
      const res = await supertest(app).get('/api/knowledge-bases');
      expect(res.status).toBe(401);
    });

    it('returns list of KBs for any authenticated user', async () => {
      const mockKbs = [{ id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() }];
      (db.select as Mock).mockReturnValue(createChain(mockKbs));

      const res = await supertest(app)
        .get('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Default');
    });
  });

  describe('POST /api/knowledge-bases', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .post('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ name: 'New KB' });
      expect(res.status).toBe(403);
    });

    it('creates a KB for admin', async () => {
      const created = { id: 'kb-new', name: 'Housing Law', slug: 'housing-law', description: null, createdAt: new Date() };
      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const createKbInsert = createChain([created]);
        activityInsert = createChain([{ id: 'evt-kb-create' }]);
        const tx = {
          insert: vi.fn()
            .mockReturnValueOnce(createKbInsert)
            .mockReturnValueOnce(activityInsert),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Housing Law' });

      expect(res.status).toBe(201);
      expect(res.body.slug).toBe('housing-law');
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'kb.created',
        actorId: 'user-3',
        knowledgeBaseId: created.id,
        subjectId: created.id,
        subjectLabel: created.name,
      }));
    });
  });

  describe('GET /api/knowledge-bases/:id', () => {
    it('returns KB details', async () => {
      (db.select as Mock).mockReturnValue(createChain([mockKb]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Default');
    });

    it('returns 404 when not found', async () => {
      (db.select as Mock).mockReturnValue(createChain([]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/nonexistent')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/knowledge-bases/:id', () => {
    it('updates KB for admin', async () => {
      const updated = { id: 'kb-1', name: 'Updated', slug: 'updated', description: 'desc', createdAt: new Date() };
      (db.update as Mock).mockReturnValue(createChain([updated]));

      const res = await supertest(app)
        .patch('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Updated', description: 'desc' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/knowledge-bases/:id', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 409 when KB has categories', async () => {
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 1 }])),
          insert: vi.fn(),
          delete: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('returns 409 when KB has tags but no categories', async () => {
      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 1 }])),
          insert: vi.fn(),
          delete: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(409);
      expect(tx!.insert).not.toHaveBeenCalled();
      expect(tx!.delete).not.toHaveBeenCalled();
    });

    it('returns 409 when KB has import jobs but no categories', async () => {
      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 1 }])),
          insert: vi.fn(),
          delete: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(409);
      expect(tx!.insert).not.toHaveBeenCalled();
      expect(tx!.delete).not.toHaveBeenCalled();
    });

    it('deletes KB when empty', async () => {
      let activityInsert: ReturnType<typeof createChain>;
      let deleteChain: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        activityInsert = createChain([{ id: 'evt-kb-delete' }]);
        deleteChain = createChain(undefined);
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }])),
          insert: vi.fn().mockReturnValueOnce(activityInsert),
          delete: vi.fn().mockReturnValueOnce(deleteChain),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(204);
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'kb.deleted',
        actorId: 'user-3',
        knowledgeBaseId: 'kb-1',
        subjectId: 'kb-1',
        subjectLabel: 'Default',
      }));
      expect(deleteChain!.where).toHaveBeenCalled();
    });
  });

  describe('KB User Role routes', () => {
    describe('GET /api/knowledge-bases/:kbId/users', () => {
      it('returns 403 for viewer', async () => {
        // resolveKb needs to find the KB first
        (db.select as Mock).mockReturnValue(createChain([{ id: 'kb-1', name: 'Test', slug: 'test', description: null, createdAt: new Date() }]));
        // requireKbAdmin checks KB-level role — return empty (no KB admin role)
        (db.execute as Mock).mockResolvedValueOnce([]);

        const res = await supertest(app)
          .get('/api/knowledge-bases/kb-1/users')
          .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
        expect(res.status).toBe(403);
      });

      it('returns user list with KB roles for admin', async () => {
        // resolveKb finds the KB
        (db.select as Mock).mockReturnValue(createChain([{ id: 'kb-1', name: 'Test', slug: 'test', description: null, createdAt: new Date() }]));
        const mockUsers = [
          { userId: 'user-1', email: 'a@test.com', name: 'A', role: 'editor', knowledgeBaseId: 'kb-1' },
        ];
        (db.execute as Mock).mockResolvedValueOnce(mockUsers);

        const res = await supertest(app)
          .get('/api/knowledge-bases/kb-1/users')
          .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
      });
    });

    describe('POST /api/knowledge-bases/:kbId/users/:userId', () => {
      it('sets KB role for user', async () => {
        // resolveKb finds the KB
        (db.select as Mock).mockReturnValue(createChain([{ id: 'kb-1', name: 'Test', slug: 'test', description: null, createdAt: new Date() }]));
        (db.insert as Mock).mockReturnValue(createChain([{ userId: 'user-1', knowledgeBaseId: 'kb-1', role: 'editor' }]));

        const res = await supertest(app)
          .post('/api/knowledge-bases/kb-1/users/user-1')
          .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
          .send({ role: 'editor' });

        expect(res.status).toBe(200);
      });
    });

    describe('DELETE /api/knowledge-bases/:kbId/users/:userId', () => {
      it('removes KB role', async () => {
        // resolveKb finds the KB
        (db.select as Mock).mockReturnValue(createChain([{ id: 'kb-1', name: 'Test', slug: 'test', description: null, createdAt: new Date() }]));
        (db.delete as Mock).mockReturnValue(createChain(undefined));

        const res = await supertest(app)
          .delete('/api/knowledge-bases/kb-1/users/user-1')
          .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

        expect(res.status).toBe(204);
      });
    });
  });
});
