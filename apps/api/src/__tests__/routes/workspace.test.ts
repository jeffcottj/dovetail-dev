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

vi.mock('../../utils/category-path.js', () => ({
  buildCategoryPath: vi.fn(async (categoryId: string) => (
    categoryId === 'cat-1' ? ['housing'] : ['tenant']
  )),
}));

import { app } from '../../app.js';
import { db } from '@dovetail/db';

function makeSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'article-1',
    title: 'Legal Aid Overview',
    slug: 'legal-aid-overview',
    categoryId: 'cat-1',
    knowledgeBaseId: 'kb-1',
    knowledgeBaseName: 'Default',
    knowledgeBaseSlug: 'default',
    authorId: 'user-1',
    status: 'published',
    createdAt: new Date('2026-03-28T12:00:00.000Z'),
    updatedAt: new Date('2026-03-28T12:00:00.000Z'),
    rank: 0.5,
    ...overrides,
  };
}

describe('Workspace activity routes', () => {
  let viewerToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
  });

  describe('GET /api/workspace/activity', () => {
    it('returns 401 without auth', async () => {
      const res = await supertest(app).get('/api/workspace/activity');

      expect(res.status).toBe(401);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('returns recent article activity rows', async () => {
      (db.execute as Mock).mockResolvedValueOnce([
        {
          id: 'evt-2',
          kind: 'article.edited',
          createdAt: new Date('2026-03-28T13:00:00.000Z'),
          actorId: 'user-2',
          actorName: 'Sam Patel',
          actorEmail: 'sam@example.com',
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: 'Housing',
          subjectId: 'article-2',
          subjectLabel: 'Rent Escrow Basics',
          metadata: { source: 'workspace' },
        },
        {
          id: 'evt-1',
          kind: 'article.created',
          createdAt: new Date('2026-03-28T12:00:00.000Z'),
          actorId: 'user-1',
          actorName: 'Maya Chen',
          actorEmail: 'maya@example.com',
          knowledgeBaseId: null,
          knowledgeBaseName: null,
          subjectId: 'article-1',
          subjectLabel: 'Tenant Eviction Timeline',
          metadata: null,
        },
      ]);

      const res = await supertest(app)
        .get('/api/workspace/activity')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 'evt-2',
          kind: 'article.edited',
          createdAt: '2026-03-28T13:00:00.000Z',
          actor: {
            id: 'user-2',
            name: 'Sam Patel',
            email: 'sam@example.com',
          },
          knowledgeBase: {
            id: 'kb-1',
            name: 'Housing',
          },
          subject: {
            id: 'article-2',
            label: 'Rent Escrow Basics',
          },
          metadata: {
            source: 'workspace',
          },
        },
        {
          id: 'evt-1',
          kind: 'article.created',
          createdAt: '2026-03-28T12:00:00.000Z',
          actor: {
            id: 'user-1',
            name: 'Maya Chen',
            email: 'maya@example.com',
          },
          knowledgeBase: null,
          subject: {
            id: 'article-1',
            label: 'Tenant Eviction Timeline',
          },
          metadata: {},
        },
      ]);
    });

    it('filters out non-article activity kinds', async () => {
      (db.execute as Mock).mockResolvedValueOnce([
        {
          id: 'evt-3',
          kind: 'kb.created',
          createdAt: new Date('2026-03-28T14:00:00.000Z'),
          actorId: 'admin-1',
          actorName: 'Jordan Lee',
          actorEmail: 'jordan@example.com',
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: 'Housing',
          subjectId: 'kb-1',
          subjectLabel: 'Housing',
          metadata: {},
        },
      ]);

      const res = await supertest(app)
        .get('/api/workspace/activity')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns [] when there are no activity rows', async () => {
      (db.execute as Mock).mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/workspace/activity')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});

describe('Workspace search routes', () => {
  let viewerToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
  });

  describe('GET /api/workspace/search', () => {
    it('returns 400 when q is missing', async () => {
      const res = await supertest(app)
        .get('/api/workspace/search')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(400);
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('returns mixed KB full-text search results', async () => {
      (db.execute as Mock)
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([
          makeSearchResult({
            id: 'article-1',
            title: 'Housing Benefits Overview',
            slug: 'housing-benefits-overview',
            categoryId: 'cat-1',
            knowledgeBaseId: 'kb-1',
            knowledgeBaseName: 'Housing',
            knowledgeBaseSlug: 'housing',
            authorId: 'user-1',
            rank: 0.91,
          }),
          makeSearchResult({
            id: 'article-2',
            title: 'Tenant Rights Overview',
            slug: 'tenant-rights-overview',
            categoryId: 'cat-2',
            knowledgeBaseId: 'kb-2',
            knowledgeBaseName: 'Tenant',
            knowledgeBaseSlug: 'tenant',
            authorId: 'user-2',
            createdAt: new Date('2026-03-28T11:00:00.000Z'),
            updatedAt: new Date('2026-03-28T11:00:00.000Z'),
            rank: 0.82,
          }),
        ]);

      const res = await supertest(app)
        .get('/api/workspace/search?q=overview')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: [
          {
            id: 'article-1',
            title: 'Housing Benefits Overview',
            slug: 'housing-benefits-overview',
            categoryId: 'cat-1',
            categoryPath: ['housing'],
            knowledgeBaseId: 'kb-1',
            knowledgeBaseName: 'Housing',
            knowledgeBaseSlug: 'housing',
            authorId: 'user-1',
            status: 'published',
            createdAt: '2026-03-28T12:00:00.000Z',
            updatedAt: '2026-03-28T12:00:00.000Z',
            rank: 0.91,
          },
          {
            id: 'article-2',
            title: 'Tenant Rights Overview',
            slug: 'tenant-rights-overview',
            categoryId: 'cat-2',
            categoryPath: ['tenant'],
            knowledgeBaseId: 'kb-2',
            knowledgeBaseName: 'Tenant',
            knowledgeBaseSlug: 'tenant',
            authorId: 'user-2',
            status: 'published',
            createdAt: '2026-03-28T11:00:00.000Z',
            updatedAt: '2026-03-28T11:00:00.000Z',
            rank: 0.82,
          },
        ],
        total: 2,
        page: 1,
        limit: 20,
      });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('keeps total correct when a later page has no rows', async () => {
      (db.execute as Mock)
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([]);

      const res = await supertest(app)
        .get('/api/workspace/search?q=overview&page=2&limit=20')
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: [],
        total: 1,
        page: 2,
        limit: 20,
      });
      expect(db.execute).toHaveBeenCalledTimes(2);
    });
  });
});
