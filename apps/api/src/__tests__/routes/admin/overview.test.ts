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

describe('Admin overview routes', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  describe('GET /api/admin/overview', () => {
    it('returns 403 for non-admin', async () => {
      const res = await supertest(app)
        .get('/api/admin/overview')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(403);
    });

    it('returns global admin metrics and recent activity', async () => {
      (db.select as Mock)
        .mockReturnValueOnce(createChain([{ count: 12 }]))
        .mockReturnValueOnce(createChain([
          { role: 'admin' },
          { role: 'viewer' },
          { role: 'viewer' },
          { role: 'editor' },
        ]))
        .mockReturnValueOnce(createChain([{ count: 4 }]))
        .mockReturnValueOnce(createChain([{ count: 3 }]))
        .mockReturnValueOnce(createChain([{ count: 2 }]));
      (db.execute as Mock).mockResolvedValueOnce([
        {
          id: 'evt-1',
          kind: 'article.edited',
          createdAt: new Date('2026-03-28T12:00:00.000Z'),
          actorId: 'user-1',
          actorName: 'Maya Chen',
          actorEmail: 'maya@example.com',
          knowledgeBaseId: 'kb-1',
          knowledgeBaseName: 'Housing',
          subjectId: 'article-1',
          subjectLabel: 'Tenant Eviction Timeline',
          metadata: {},
        },
      ]);

      const res = await supertest(app)
        .get('/api/admin/overview')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.metrics).toEqual({
        users: {
          total: 12,
          byRole: {
            admin: 1,
            editor: 1,
            viewer: 2,
          },
        },
        knowledgeBases: { total: 4 },
        apiKeys: {
          active: 3,
          revoked: 2,
        },
      });
      expect(res.body.activity).toHaveLength(1);
      expect(res.body.activity[0]).toMatchObject({
        kind: 'article.edited',
        actor: {
          id: 'user-1',
          name: 'Maya Chen',
          email: 'maya@example.com',
        },
        knowledgeBase: {
          id: 'kb-1',
          name: 'Housing',
        },
        subject: {
          id: 'article-1',
          label: 'Tenant Eviction Timeline',
        },
      });
    });
  });
});
