import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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

const VALID_CATEGORY_ID = '00000000-0000-4000-8000-000000000001';

describe('Me routes', () => {
  let viewerToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
  });

  describe('GET /api/me/effective-role', () => {
    it('returns 401 without auth', async () => {
      const res = await supertest(app)
        .get(`/api/me/effective-role?categoryId=${VALID_CATEGORY_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 400 without categoryId param', async () => {
      const res = await supertest(app)
        .get('/api/me/effective-role')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid (non-uuid) categoryId', async () => {
      const res = await supertest(app)
        .get('/api/me/effective-role?categoryId=not-a-uuid')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
      expect(res.status).toBe(400);
    });

    it('returns the global role when no category override exists', async () => {
      // resolveRole does db.execute — return empty array so it falls back to global role
      (db.execute as Mock).mockResolvedValue([]);

      const res = await supertest(app)
        .get(`/api/me/effective-role?categoryId=${VALID_CATEGORY_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ role: 'editor' });
    });

    it('returns the category-level override role when one exists', async () => {
      // resolveRole does db.execute — return a row with the override role
      (db.execute as Mock).mockResolvedValue([{ role: 'editor' }]);

      const res = await supertest(app)
        .get(`/api/me/effective-role?categoryId=${VALID_CATEGORY_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ role: 'editor' });
    });
  });
});
