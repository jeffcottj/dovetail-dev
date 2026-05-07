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

const mockKb = {
  id: 'kb-1',
  name: 'Default',
  slug: 'default',
  description: null,
  defaultAccess: 'org_viewer' as const,
  createdAt: new Date(),
};
const privateKb = {
  id: 'kb-2',
  name: 'Private',
  slug: 'private',
  description: null,
  defaultAccess: 'private' as const,
  createdAt: new Date(),
};

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

    it('returns only visible KBs for an authenticated viewer', async () => {
      (db.execute as Mock).mockResolvedValueOnce([mockKb]);

      const res = await supertest(app)
        .get('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Default');
    });

    it('includes private KBs for users with explicit KB or category access', async () => {
      (db.execute as Mock).mockResolvedValueOnce([mockKb, privateKb]);

      const res = await supertest(app)
        .get('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.map((kb: { id: string }) => kb.id)).toEqual(['kb-1', 'kb-2']);
    });

    it('returns all KBs for a global admin', async () => {
      (db.execute as Mock).mockResolvedValueOnce([mockKb, privateKb]);

      const res = await supertest(app)
        .get('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
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

    it('creates a KB for admin with the default org-visible policy', async () => {
      const created = {
        id: 'kb-new',
        name: 'Housing Law',
        slug: 'housing-law',
        description: null,
        defaultAccess: 'org_viewer' as const,
        createdAt: new Date(),
      };
      let createKbInsert: ReturnType<typeof createChain>;
      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        createKbInsert = createChain([created]);
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
      expect(createKbInsert!.values).toHaveBeenCalledWith({
        name: 'Housing Law',
        slug: 'housing-law',
        description: null,
        defaultAccess: 'org_viewer',
      });
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'kb.created',
        actorId: 'user-3',
        knowledgeBaseId: created.id,
        subjectId: created.id,
        subjectLabel: created.name,
        metadata: { defaultAccess: 'org_viewer' },
      }));
    });

    it('creates a private KB for admin', async () => {
      const created = {
        id: 'kb-private-new',
        name: 'Private Law',
        slug: 'private-law',
        description: null,
        defaultAccess: 'private' as const,
        createdAt: new Date(),
      };
      let createKbInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        createKbInsert = createChain([created]);
        const tx = {
          insert: vi.fn()
            .mockReturnValueOnce(createKbInsert)
            .mockReturnValueOnce(createChain([{ id: 'evt-kb-create' }])),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Private Law', defaultAccess: 'private' });

      expect(res.status).toBe(201);
      expect(res.body.defaultAccess).toBe('private');
      expect(createKbInsert!.values).toHaveBeenCalledWith({
        name: 'Private Law',
        slug: 'private-law',
        description: null,
        defaultAccess: 'private',
      });
    });

    it('rejects invalid default access on create', async () => {
      const res = await supertest(app)
        .post('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Bad KB', defaultAccess: 'public' });

      expect(res.status).toBe(400);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('preserves requested default access when retrying a slug conflict', async () => {
      const created = {
        id: 'kb-new',
        name: 'Housing Law',
        slug: 'housing-law-retry',
        description: null,
        defaultAccess: 'private' as const,
        createdAt: new Date(),
      };
      const duplicateSlugError = { code: '23505', constraint_name: 'knowledge_bases_slug_unique' };
      let retryInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock)
        .mockRejectedValueOnce(duplicateSlugError)
        .mockImplementationOnce(async (fn: Function) => {
          retryInsert = createChain([created]);
          const tx = {
            insert: vi.fn()
              .mockReturnValueOnce(retryInsert)
              .mockReturnValueOnce(createChain([{ id: 'evt-kb-create' }])),
          };
          return fn(tx);
        });

      const res = await supertest(app)
        .post('/api/knowledge-bases')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Housing Law', defaultAccess: 'private' });

      expect(res.status).toBe(201);
      expect(retryInsert!.values).toHaveBeenCalledWith(expect.objectContaining({
        defaultAccess: 'private',
      }));
    });
  });

  describe('GET /api/knowledge-bases/:id', () => {
    it('returns KB details', async () => {
      (db.select as Mock).mockReturnValue(createChain([mockKb]));
      (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Default');
    });

    it('returns 404 for an invisible private KB', async () => {
      (db.select as Mock).mockReturnValue(createChain([privateKb]));
      (db.execute as Mock)
        .mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: null }])
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-2')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(404);
    });

    it('returns private KB details for a global admin', async () => {
      (db.select as Mock).mockReturnValue(createChain([privateKb]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-2')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Private');
      expect(db.execute).not.toHaveBeenCalled();
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
      const updated = {
        id: 'kb-1',
        name: 'Updated',
        slug: 'updated',
        description: 'desc',
        defaultAccess: 'org_viewer' as const,
        createdAt: new Date(),
      };
      let updateChain: ReturnType<typeof createChain>;
      let tx: { update: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
      (db.select as Mock).mockReturnValue(createChain([mockKb]));
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        updateChain = createChain([updated]);
        tx = {
          update: vi.fn().mockReturnValueOnce(updateChain),
          insert: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .patch('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Updated', description: 'desc' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
      expect(updateChain!.set).toHaveBeenCalledWith({
        name: 'Updated',
        slug: 'updated',
        description: 'desc',
      });
      expect(tx!.insert).not.toHaveBeenCalled();
    });

    it('updates default access for a global admin and records activity', async () => {
      const updated = { ...mockKb, defaultAccess: 'private' as const };
      let activityInsert: ReturnType<typeof createChain>;
      (db.select as Mock).mockReturnValue(createChain([mockKb]));
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        activityInsert = createChain([{ id: 'evt-access-change' }]);
        const tx = {
          update: vi.fn().mockReturnValueOnce(createChain([updated])),
          insert: vi.fn().mockReturnValueOnce(activityInsert),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .patch('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ defaultAccess: 'private' });

      expect(res.status).toBe(200);
      expect(res.body.defaultAccess).toBe('private');
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'kb.access_changed',
        actorId: 'user-3',
        knowledgeBaseId: 'kb-1',
        subjectId: 'kb-1',
        subjectLabel: 'Default',
        metadata: { from: 'org_viewer', to: 'private' },
      }));
    });

    it('updates default access for an explicit KB admin', async () => {
      const updated = { ...privateKb, defaultAccess: 'org_viewer' as const };
      (db.select as Mock).mockReturnValue(createChain([privateKb]));
      (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: 'admin' }]);
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          update: vi.fn().mockReturnValueOnce(createChain([updated])),
          insert: vi.fn().mockReturnValueOnce(createChain([{ id: 'evt-access-change' }])),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .patch('/api/knowledge-bases/kb-2')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ defaultAccess: 'org_viewer' });

      expect(res.status).toBe(200);
      expect(res.body.defaultAccess).toBe('org_viewer');
    });

    it('returns 403 when a non-admin tries to update default access', async () => {
      (db.select as Mock).mockReturnValue(createChain([mockKb]));
      (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

      const res = await supertest(app)
        .patch('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`)
        .send({ defaultAccess: 'private' });

      expect(res.status).toBe(403);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects invalid default access on update', async () => {
      (db.select as Mock).mockReturnValue(createChain([mockKb]));

      const res = await supertest(app)
        .patch('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ defaultAccess: 'public' });

      expect(res.status).toBe(400);
      expect(db.transaction).not.toHaveBeenCalled();
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

    it('returns 404 when the knowledge base does not exist', async () => {
      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        tx = {
          select: vi.fn().mockReturnValueOnce(createChain([])),
          insert: vi.fn(),
          delete: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/missing-kb')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(404);
      expect(tx!.insert).not.toHaveBeenCalled();
      expect(tx!.delete).not.toHaveBeenCalled();
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

    it('returns 409 when KB has an active import job', async () => {
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

    it('deletes KB when only completed or failed import history exists and cleans up history', async () => {
      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      let importJobsDeleteChain: ReturnType<typeof createChain>;
      let kbDeleteChain: ReturnType<typeof createChain>;
      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        importJobsDeleteChain = createChain(undefined);
        kbDeleteChain = createChain(undefined);
        activityInsert = createChain([{ id: 'evt-kb-delete' }]);
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }])),
          insert: vi.fn().mockReturnValueOnce(activityInsert),
          delete: vi.fn()
            .mockReturnValueOnce(importJobsDeleteChain)
            .mockReturnValueOnce(kbDeleteChain),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(204);
      expect(activityInsert!.values).toHaveBeenCalled();
      expect(tx!.delete).toHaveBeenCalledTimes(2);
      expect(importJobsDeleteChain!.where).toHaveBeenCalled();
      expect(kbDeleteChain!.where).toHaveBeenCalled();
    });

    it('deletes KB when empty', async () => {
      let activityInsert: ReturnType<typeof createChain>;
      let importJobsDeleteChain: ReturnType<typeof createChain>;
      let deleteChain: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        activityInsert = createChain([{ id: 'evt-kb-delete' }]);
        importJobsDeleteChain = createChain(undefined);
        deleteChain = createChain(undefined);
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }])),
          insert: vi.fn().mockReturnValueOnce(activityInsert),
          delete: vi.fn()
            .mockReturnValueOnce(importJobsDeleteChain)
            .mockReturnValueOnce(deleteChain),
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
      expect(importJobsDeleteChain!.where).toHaveBeenCalled();
      expect(deleteChain!.where).toHaveBeenCalled();
    });

    it('returns 409 when KB delete loses a race to a new import job', async () => {
      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      let importJobsDeleteChain: ReturnType<typeof createChain>;
      const kbDeleteError = { code: '23503' };
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        importJobsDeleteChain = createChain(undefined);
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }])),
          insert: vi.fn().mockReturnValueOnce(createChain([{ id: 'evt-kb-delete' }])),
          delete: vi.fn()
            .mockReturnValueOnce(importJobsDeleteChain)
            .mockImplementationOnce(() => ({
              where: vi.fn().mockRejectedValue(kbDeleteError),
            })),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(409);
      expect(tx!.delete).toHaveBeenCalledTimes(2);
    });

    it('returns 404 when kb.deleted activity insert loses a race to a concurrent delete', async () => {
      let tx: {
        select: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
      };
      let importJobsDeleteChain: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        importJobsDeleteChain = createChain(undefined);
        tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }]))
            .mockReturnValueOnce(createChain([{ count: 0 }])),
          insert: vi.fn().mockImplementationOnce(() => ({
            values: vi.fn().mockRejectedValue({ code: '23503' }),
          })),
          delete: vi.fn().mockReturnValueOnce(importJobsDeleteChain),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(404);
      expect(tx!.delete).toHaveBeenCalledTimes(1);
    });

    it('purges KB contents and records counts when ?purge=true', async () => {
      let activityInsert: ReturnType<typeof createChain>;
      let attachmentsDelete: ReturnType<typeof createChain>;
      let articlesDelete: ReturnType<typeof createChain>;
      let categoriesDelete: ReturnType<typeof createChain>;
      let tagsDelete: ReturnType<typeof createChain>;
      let importJobsDelete: ReturnType<typeof createChain>;
      let kbDelete: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        activityInsert = createChain([{ id: 'evt-kb-purge' }]);
        attachmentsDelete = createChain(undefined);
        articlesDelete = createChain(undefined);
        categoriesDelete = createChain(undefined);
        tagsDelete = createChain(undefined);
        importJobsDelete = createChain(undefined);
        kbDelete = createChain(undefined);
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb])) // KB lookup
            .mockReturnValueOnce(createChain([{ id: 'cat-1' }, { id: 'cat-2' }])) // category ids
            .mockReturnValueOnce(createChain([{ id: 'art-1' }, { id: 'art-2' }, { id: 'art-3' }])) // article ids
            .mockReturnValueOnce(createChain([{ count: 5 }])) // tag count
            .mockReturnValueOnce(createChain([{ count: 2 }])), // import job count
          insert: vi.fn().mockReturnValueOnce(activityInsert),
          delete: vi.fn()
            .mockReturnValueOnce(attachmentsDelete)
            .mockReturnValueOnce(articlesDelete)
            .mockReturnValueOnce(categoriesDelete)
            .mockReturnValueOnce(tagsDelete)
            .mockReturnValueOnce(importJobsDelete)
            .mockReturnValueOnce(kbDelete),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1?purge=true')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(204);
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'kb.deleted',
        actorId: 'user-3',
        knowledgeBaseId: 'kb-1',
        subjectId: 'kb-1',
        subjectLabel: 'Default',
        metadata: {
          purged: true,
          articles: 3,
          categories: 2,
          tags: 5,
          importJobs: 2,
        },
      }));
      // attachments, articles, categories, tags, import_jobs, knowledge_bases
      expect(attachmentsDelete!.where).toHaveBeenCalled();
      expect(articlesDelete!.where).toHaveBeenCalled();
      expect(categoriesDelete!.where).toHaveBeenCalled();
      expect(tagsDelete!.where).toHaveBeenCalled();
      expect(importJobsDelete!.where).toHaveBeenCalled();
      expect(kbDelete!.where).toHaveBeenCalled();
    });

    it('purge succeeds against an already-empty KB', async () => {
      let activityInsert: ReturnType<typeof createChain>;
      let tagsDelete: ReturnType<typeof createChain>;
      let importJobsDelete: ReturnType<typeof createChain>;
      let kbDelete: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        activityInsert = createChain([{ id: 'evt-kb-purge' }]);
        tagsDelete = createChain(undefined);
        importJobsDelete = createChain(undefined);
        kbDelete = createChain(undefined);
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockKb]))
            .mockReturnValueOnce(createChain([])) // no categories
            .mockReturnValueOnce(createChain([{ count: 0 }])) // tag count
            .mockReturnValueOnce(createChain([{ count: 0 }])), // import job count
          insert: vi.fn().mockReturnValueOnce(activityInsert),
          delete: vi.fn()
            .mockReturnValueOnce(tagsDelete)
            .mockReturnValueOnce(importJobsDelete)
            .mockReturnValueOnce(kbDelete),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1?purge=true')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(204);
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'kb.deleted',
        actorId: 'user-3',
        knowledgeBaseId: 'kb-1',
        subjectId: 'kb-1',
        subjectLabel: 'Default',
        metadata: { purged: true, articles: 0, categories: 0, tags: 0, importJobs: 0 },
      }));
    });

    it('purge requires admin (403 for editor)', async () => {
      const res = await supertest(app)
        .delete('/api/knowledge-bases/kb-1?purge=true')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
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
