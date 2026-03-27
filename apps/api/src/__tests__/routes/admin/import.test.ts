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
import { db } from '@dovetail/db';

const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };

describe('Import admin routes', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  describe('POST /api/knowledge-bases/kb-1/admin/import/preview', () => {
    it('returns 403 for non-admin users', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when no file is uploaded', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/knowledge-bases/kb-1/admin/import/execute', () => {
    it('returns 403 for non-admin users', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/execute')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
        .send({ tempId: 'fake', options: { defaultStatus: 'draft' } });
      expect(res.status).toBe(403);
    });

    it('returns 400 for missing tempId', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/execute')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ options: { defaultStatus: 'draft' } });
      expect(res.status).toBe(400);
    });
  });
});
