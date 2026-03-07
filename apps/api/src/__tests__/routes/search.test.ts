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

const CAT_ID = '00000000-0000-4000-8000-000000000001';

const mockSearchResult = {
  id: '00000000-0000-4000-8000-000000000010',
  title: 'Legal Aid Overview',
  slug: 'legal-aid-overview',
  categoryId: CAT_ID,
  authorId: 'user-1',
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  rank: 0.5,
};

describe('Search routes', () => {
  let viewerToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
  });

  describe('GET /api/search', () => {
    it('returns 401 without auth', async () => {
      const res = await supertest(app).get('/api/search?q=legal');
      expect(res.status).toBe(401);
    });

    it('returns 400 when q param is missing', async () => {
      const res = await supertest(app)
        .get('/api/search')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
      expect(res.status).toBe(400);
    });

    it('returns search results for a query', async () => {
      const countChain = createChain([{ count: 1 }]);
      const dataChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get('/api/search?q=legal')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Legal Aid Overview');
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
    });

    it('supports pagination', async () => {
      const countChain = createChain([{ count: 50 }]);
      const dataChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get('/api/search?q=legal&page=2&limit=10')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
    });

    it('supports categoryId filter', async () => {
      const countChain = createChain([{ count: 1 }]);
      const dataChain = createChain([mockSearchResult]);
      (db.select as Mock)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get(`/api/search?q=legal&categoryId=${CAT_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});
