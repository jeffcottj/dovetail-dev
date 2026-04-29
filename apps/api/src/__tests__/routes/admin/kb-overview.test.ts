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

const mockKb = {
  id: 'kb-1',
  name: 'Housing',
  slug: 'housing',
  description: null,
  defaultAccess: 'org_viewer' as const,
  createdAt: new Date('2026-03-28T09:00:00.000Z'),
};

describe('Knowledge base admin overview routes', () => {
  let adminToken: string;
  let kbAdminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    kbAdminToken = await makeToken({ sub: 'editor-2', role: 'editor' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  describe('GET /api/knowledge-bases/:kbId/admin/overview', () => {
    it('returns 401 before KB resolution when unauthenticated', async () => {
      const res = await supertest(app)
        .get('/api/knowledge-bases/missing-kb/admin/overview');

      expect(res.status).toBe(401);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('returns 404 for an authenticated admin when the KB does not exist', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/missing-kb/admin/overview')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('returns 403 for a non-admin without a KB admin role', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/admin/overview')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns KB-scoped metrics and KB-scoped activity for a global admin', async () => {
      let articleActivityCountChain: ReturnType<typeof createChain>;
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([{ count: 5 }]))
        .mockReturnValueOnce(createChain([{ count: 9 }]))
        .mockReturnValueOnce(createChain([{ count: 2 }]))
        .mockImplementationOnce(() => {
          articleActivityCountChain = createChain([{ count: 14 }]);
          return articleActivityCountChain;
        });
      (db.execute as Mock).mockResolvedValueOnce([
        {
          id: 'evt-2',
          kind: 'article.created',
          createdAt: new Date('2026-03-28T13:00:00.000Z'),
          actorId: 'user-2',
          actorName: 'Sam Patel',
          actorEmail: 'sam@example.com',
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: 'Housing',
          subjectId: 'article-2',
          subjectLabel: 'Rent Escrow Basics',
          metadata: {},
        },
      ]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/admin/overview')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.kb).toMatchObject({
        id: 'kb-1',
        name: 'Housing',
        slug: 'housing',
      });
      expect(res.body.metrics).toEqual({
        users: { total: 5 },
        tags: { total: 9 },
        imports: { total: 2 },
        articleActivity: { recent: 14 },
      });
      expect(articleActivityCountChain!.where).toHaveBeenCalledTimes(1);
      expect(res.body.activity[0]).toMatchObject({
        kind: 'article.created',
        knowledgeBase: {
          id: 'kb-1',
          name: 'Housing',
        },
      });
    });

    it('returns KB-scoped metrics and activity for a KB admin', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([{ count: 4 }]))
        .mockReturnValueOnce(createChain([{ count: 7 }]))
        .mockReturnValueOnce(createChain([{ count: 3 }]))
        .mockReturnValueOnce(createChain([{ count: 11 }]));
      (db.execute as Mock)
        .mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: 'admin' }])
        .mockResolvedValueOnce([
          {
            id: 'evt-3',
            kind: 'import.started',
            createdAt: new Date('2026-03-28T14:00:00.000Z'),
            actorId: 'editor-2',
            actorName: 'Taylor Rivera',
            actorEmail: 'taylor@example.com',
            knowledgeBaseId: 'kb-1',
            knowledgeBaseName: 'Housing',
            subjectId: 'job-1',
            subjectLabel: 'Import job started',
            metadata: { jobId: 'job-1' },
          },
        ]);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/admin/overview')
        .set('Cookie', `${COOKIE_NAME}=${kbAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.metrics.tags.total).toBe(7);
      expect(res.body.activity[0]).toMatchObject({
        kind: 'import.started',
        actor: {
          id: 'editor-2',
          name: 'Taylor Rivera',
        },
      });
    });
  });
});
