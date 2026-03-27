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

const ART_ID = '00000000-0000-4000-8000-000000000010';
const VER_ID = '00000000-0000-4000-8000-000000000020';
const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };

const mockVersion = {
  id: VER_ID,
  articleId: ART_ID,
  title: 'Old Title',
  content: { type: 'doc', content: [] },
  authorId: 'user-2',
  versionNumber: 1,
  createdAt: new Date(),
};

const mockArticle = {
  id: ART_ID,
  title: 'Current Title',
  slug: 'current-title',
  categoryId: '00000000-0000-4000-8000-000000000001',
  authorId: 'user-2',
  content: { type: 'doc', content: [{ type: 'paragraph' }] },
  status: 'draft' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: null,
};

function mockResolveKb() {
  // resolveKb runs twice: once at the /articles mount, once at the /articles/:id/versions mount
  (db.select as Mock)
    .mockReturnValueOnce(createChain([mockKb]))
    .mockReturnValueOnce(createChain([mockKb]));
}

describe('Version history routes', () => {
  let viewerToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'user-2', role: 'editor' });
  });

  describe('GET /api/knowledge-bases/:kbId/articles/:id/versions', () => {
    it('returns paginated version list', async () => {
      mockResolveKb();
      const countChain = createChain([{ count: 1 }]);
      const dataChain = createChain([mockVersion]);
      (db.select as Mock)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(dataChain);

      const res = await supertest(app)
        .get(`/api/knowledge-bases/kb-1/articles/${ART_ID}/versions`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].versionNumber).toBe(1);
    });
  });

  describe('GET /api/knowledge-bases/:kbId/articles/:id/versions/:versionId', () => {
    it('returns a specific version', async () => {
      mockResolveKb();
      (db.select as Mock).mockReturnValueOnce(createChain([mockVersion]));

      const res = await supertest(app)
        .get(`/api/knowledge-bases/kb-1/articles/${ART_ID}/versions/${VER_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(VER_ID);
      expect(res.body.versionNumber).toBe(1);
    });

    it('returns 404 when version not found', async () => {
      mockResolveKb();
      (db.select as Mock).mockReturnValueOnce(createChain([]));

      const res = await supertest(app)
        .get(`/api/knowledge-bases/kb-1/articles/${ART_ID}/versions/nonexistent`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/knowledge-bases/:kbId/articles/:id/versions/:versionId/restore', () => {
    it('restores an old version', async () => {
      mockResolveKb();
      const restored = { ...mockArticle, title: 'Old Title', content: mockVersion.content };

      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockVersion]))   // old version
            .mockReturnValueOnce(createChain([mockArticle]))   // current article
            .mockReturnValueOnce(createChain([{ max: 1 }])),   // max version
          insert: vi.fn().mockReturnValue(createChain([])),     // insert snapshot
          update: vi.fn().mockReturnValue(createChain([restored])), // overwrite article
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post(`/api/knowledge-bases/kb-1/articles/${ART_ID}/versions/${VER_ID}/restore`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Old Title');
    });

    it('restores when POST has no body and no Content-Type (fixed client fetch)', async () => {
      mockResolveKb();
      const restored = { ...mockArticle, title: 'Old Title', content: mockVersion.content };

      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn()
            .mockReturnValueOnce(createChain([mockVersion]))   // old version
            .mockReturnValueOnce(createChain([mockArticle]))   // current article
            .mockReturnValueOnce(createChain([{ max: 1 }])),   // max version
          insert: vi.fn().mockReturnValue(createChain([])),     // insert snapshot
          update: vi.fn().mockReturnValue(createChain([restored])), // overwrite article
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post(`/api/knowledge-bases/kb-1/articles/${ART_ID}/versions/${VER_ID}/restore`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Old Title');
    });

    it('returns 403 for viewer', async () => {
      mockResolveKb();
      const res = await supertest(app)
        .post(`/api/knowledge-bases/kb-1/articles/${ART_ID}/versions/${VER_ID}/restore`)
        .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 404 when version not found', async () => {
      mockResolveKb();
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          select: vi.fn().mockReturnValue(createChain([])),
          insert: vi.fn(),
          update: vi.fn(),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post(`/api/knowledge-bases/kb-1/articles/${ART_ID}/versions/nonexistent/restore`)
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(404);
    });
  });
});
