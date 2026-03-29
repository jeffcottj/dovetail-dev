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

vi.mock('../../../services/import/import-engine.js', () => ({
  ImportEngine: class {
    onProgress() {}
    async run() {}
  },
}));

import { app } from '../../../app.js';
import { adminActivityEvents, db } from '@dovetail/db';
import { tempSessions } from '../../../routes/admin/import.js';

const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };
const TEMP_ID = '00000000-0000-4000-8000-000000000301';
const JOB_ID = '00000000-0000-4000-8000-000000000302';

describe('Import admin routes', () => {
  let adminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempSessions.clear();
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

    it('records import.started when an import job is started', async () => {
      tempSessions.set(TEMP_ID, { dir: '/tmp/import-session', createdAt: Date.now() });
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      let activityInsert: ReturnType<typeof createChain>;
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const createJobInsert = createChain([{
          id: JOB_ID,
          createdBy: 'admin-1',
          knowledgeBaseId: 'kb-1',
          options: { defaultStatus: 'draft' },
        }]);
        activityInsert = createChain([{ id: 'evt-import-started' }]);
        const tx = {
          insert: vi.fn()
            .mockReturnValueOnce(createJobInsert)
            .mockReturnValueOnce(activityInsert),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/execute')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .send({ tempId: TEMP_ID, options: { defaultStatus: 'draft' } });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBe(JOB_ID);
      expect(activityInsert!.values).toHaveBeenCalledWith({
        kind: 'import.started',
        actorId: 'admin-1',
        knowledgeBaseId: 'kb-1',
        subjectId: JOB_ID,
        subjectLabel: 'Import job started',
        metadata: {
          jobId: JOB_ID,
          defaultStatus: 'draft',
        },
      });
    });
  });

  describe('GET /api/knowledge-bases/kb-1/admin/import', () => {
    it('lists jobs scoped to the current knowledge base', async () => {
      const listChain = createChain([
        {
          id: JOB_ID,
          knowledgeBaseId: 'kb-1',
          status: 'completed',
          importedCount: 2,
          errorLog: [],
          createdAt: new Date(),
        },
      ]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(listChain);

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/admin/import')
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(listChain.where).toHaveBeenCalled();
      expect(listChain.orderBy).toHaveBeenCalled();
    });
  });
});
