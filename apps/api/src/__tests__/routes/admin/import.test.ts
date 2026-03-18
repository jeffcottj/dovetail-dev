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

describe('Import admin routes', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  describe('POST /api/admin/import/preview', () => {
    it('returns 403 for non-admin users', async () => {
      const res = await supertest(app)
        .post('/api/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when no file is uploaded', async () => {
      const res = await supertest(app)
        .post('/api/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);
      expect(res.status).toBe(400);
    });
  });
});
