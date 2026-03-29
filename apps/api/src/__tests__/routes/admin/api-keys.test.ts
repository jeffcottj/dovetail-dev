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

const KEY_ID = '00000000-0000-4000-8000-000000000099';

describe('Admin API key routes', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  describe('POST /api/admin/api-keys', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .post('/api/admin/api-keys')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ name: 'Test Key', knowledgeBaseIds: ['00000000-0000-4000-8000-000000000001'] });
      expect(res.status).toBe(403);
    });

    it('returns 400 when name is missing', async () => {
      const res = await supertest(app)
        .post('/api/admin/api-keys')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ knowledgeBaseIds: ['00000000-0000-4000-8000-000000000001'] });
      expect(res.status).toBe(400);
    });

    it('creates an API key and returns the raw key', async () => {
      const created = {
        id: KEY_ID,
        name: 'Test Key',
        keyHash: 'somehash',
        createdBy: 'admin-1',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
      };
      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const createKeyInsert = createChain([created]);
        const associationInsert = createChain([]);
        activityInsert = createChain([{ id: 'evt-1' }]);
        const tx = {
          insert: vi.fn()
            .mockReturnValueOnce(createKeyInsert)
            .mockReturnValueOnce(associationInsert)
            .mockReturnValueOnce(activityInsert),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post('/api/admin/api-keys')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ name: 'Test Key', knowledgeBaseIds: ['00000000-0000-4000-8000-000000000001'] });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(KEY_ID);
      expect(res.body.name).toBe('Test Key');
      expect(res.body.key).toBeDefined();
      expect(typeof res.body.key).toBe('string');
      expect(res.body.key.length).toBeGreaterThan(0);
      expect(res.body.knowledgeBaseIds).toEqual(['00000000-0000-4000-8000-000000000001']);
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'api_key.created',
        actorId: 'admin-1',
        subjectId: KEY_ID,
        subjectLabel: 'Test Key',
      }));
    });
  });

  describe('GET /api/admin/api-keys', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .get('/api/admin/api-keys')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns list of API keys', async () => {
      const chain = createChain([
        {
          id: KEY_ID,
          name: 'Test Key',
          createdBy: 'admin-1',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
          revokedAt: null,
        },
      ]);
      // Mock keys list
      (db.select as Mock).mockReturnValueOnce(chain);
      // Mock KB associations for the key
      (db.select as Mock).mockReturnValueOnce(createChain([{ knowledgeBaseId: '00000000-0000-4000-8000-000000000001' }]));

      const res = await supertest(app)
        .get('/api/admin/api-keys')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Test Key');
      expect(res.body[0].knowledgeBaseIds).toEqual(['00000000-0000-4000-8000-000000000001']);
    });
  });

  describe('DELETE /api/admin/api-keys/:id', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .delete(`/api/admin/api-keys/${KEY_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 404 when key not found', async () => {
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn().mockReturnValueOnce(createChain([])),
          update: vi.fn(),
          insert: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete(`/api/admin/api-keys/${KEY_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 409 when key already revoked', async () => {
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn().mockReturnValueOnce(createChain([{
            id: KEY_ID,
            name: 'Test Key',
            keyHash: 'somehash',
            createdBy: 'admin-1',
            createdAt: new Date(),
            lastUsedAt: null,
            revokedAt: new Date(),
          }])),
          update: vi.fn(),
          insert: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete(`/api/admin/api-keys/${KEY_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(409);
    });

    it('revokes an active API key', async () => {
      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        activityInsert = createChain([{ id: 'evt-2' }]);
        const tx = {
          select: vi.fn().mockReturnValueOnce(createChain([{
            id: KEY_ID,
            name: 'Test Key',
            keyHash: 'somehash',
            createdBy: 'admin-1',
            createdAt: new Date(),
            lastUsedAt: null,
            revokedAt: null,
          }])),
          update: vi.fn().mockReturnValueOnce(createChain([])),
          insert: vi.fn().mockReturnValueOnce(activityInsert),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .delete(`/api/admin/api-keys/${KEY_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('API key revoked');
      expect(activityInsert!.values).toHaveBeenCalledWith(buildAdminActivityInsert({
        kind: 'api_key.revoked',
        actorId: 'admin-1',
        subjectId: KEY_ID,
        subjectLabel: 'Test Key',
      }));
    });
  });
});
