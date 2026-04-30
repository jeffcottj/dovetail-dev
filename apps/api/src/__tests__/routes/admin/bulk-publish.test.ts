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

describe('POST /api/knowledge-bases/:kbId/admin/articles/bulk-publish', () => {
  let adminToken: string;
  let kbAdminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    kbAdminToken = await makeToken({ sub: 'kb-admin-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
  });

  it('returns 403 for non-admin users', async () => {
    (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
    (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'org_viewer', kbRole: null }]);
    const res = await supertest(app)
      .post('/api/knowledge-bases/kb-1/admin/articles/bulk-publish')
      .set('Cookie', `${COOKIE_NAME}=${editorToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('publishes all draft articles when no importJobId given', async () => {
    (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
    const updateChain = createChain([{ id: '1' }, { id: '2' }]);
    (db.update as Mock).mockReturnValue(updateChain);

    const res = await supertest(app)
      .post('/api/knowledge-bases/kb-1/admin/articles/bulk-publish')
      .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
  });

  it('allows KB admins to bulk publish within their KB', async () => {
    (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
    (db.execute as Mock).mockResolvedValueOnce([{ defaultAccess: 'private', kbRole: 'admin' }]);
    const updateChain = createChain([{ id: '1' }]);
    (db.update as Mock).mockReturnValue(updateChain);

    const res = await supertest(app)
      .post('/api/knowledge-bases/kb-1/admin/articles/bulk-publish')
      .set('Cookie', `${COOKIE_NAME}=${kbAdminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.published).toBe(1);
    expect(db.update).toHaveBeenCalled();
  });
});
