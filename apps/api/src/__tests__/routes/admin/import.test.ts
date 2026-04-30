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
import { jobListeners, tempSessions } from '../../../routes/admin/import.js';

const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };
const TEMP_ID = '00000000-0000-4000-8000-000000000301';
const JOB_ID = '00000000-0000-4000-8000-000000000302';

describe('Import admin routes', () => {
  let adminToken: string;
  let kbAdminToken: string;
  let editorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempSessions.clear();
    jobListeners.clear();
    adminToken = await makeToken({ sub: 'admin-1', role: 'admin' });
    kbAdminToken = await makeToken({ sub: 'kb-admin-1', role: 'viewer' });
    editorToken = await makeToken({ sub: 'editor-1', role: 'editor' });
    (db.execute as Mock).mockResolvedValue([{ defaultAccess: 'org_viewer', kbRole: null }]);
  });

  function mockEffectiveKbRole(role: 'viewer' | 'editor' | 'admin' | null) {
    (db.execute as Mock).mockResolvedValue([{ defaultAccess: 'private', kbRole: role }]);
  }

  describe('POST /api/knowledge-bases/kb-1/admin/import/preview', () => {
    it('returns 403 for users without KB admin access', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);
      expect(res.status).toBe(403);
    });

    it('allows KB admins through the authorization gate', async () => {
      mockEffectiveKbRole('admin');
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/preview')
        .set('Cookie', `${COOKIE_NAME}=${kbAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file uploaded');
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
    it('returns 403 for users without KB admin access', async () => {
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

    it('allows KB admins to execute imports for their KB', async () => {
      mockEffectiveKbRole('admin');
      tempSessions.set(TEMP_ID, { dir: '/tmp/import-session', createdAt: Date.now() });
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));
      (db.transaction as Mock).mockImplementation(async (fn: Function) => {
        const tx = {
          insert: vi.fn()
            .mockReturnValueOnce(createChain([{
              id: JOB_ID,
              createdBy: 'kb-admin-1',
              knowledgeBaseId: 'kb-1',
              options: { defaultStatus: 'draft' },
            }]))
            .mockReturnValueOnce(createChain([{ id: 'evt-import-started' }])),
        };
        return fn(tx);
      });

      const res = await supertest(app)
        .post('/api/knowledge-bases/kb-1/admin/import/execute')
        .set('Cookie', `${COOKIE_NAME}=${kbAdminToken}`)
        .send({ tempId: TEMP_ID, options: { defaultStatus: 'draft' } });

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBe(JOB_ID);
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
    it('returns 403 for users without KB admin access', async () => {
      (db.select as Mock).mockReturnValueOnce(createChain([mockKb]));

      const res = await supertest(app)
        .get('/api/knowledge-bases/kb-1/admin/import')
        .set('Cookie', `${COOKIE_NAME}=${editorToken}`);

      expect(res.status).toBe(403);
    });

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

    it('lists jobs for KB admins in their KB', async () => {
      mockEffectiveKbRole('admin');
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
        .set('Cookie', `${COOKIE_NAME}=${kbAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(listChain.where).toHaveBeenCalled();
    });
  });

  describe('GET /api/knowledge-bases/kb-1/admin/import/:id', () => {
    it('does not return a job outside the current knowledge base scope', async () => {
      const detailChain = createChain([]);
      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(detailChain);

      const res = await supertest(app)
        .get(`/api/knowledge-bases/kb-1/admin/import/${JOB_ID}`)
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`);

      expect(res.status).toBe(404);
      expect(detailChain.where).toHaveBeenCalled();
    });
  });

  describe('GET /api/knowledge-bases/kb-1/admin/import/:id/progress', () => {
    it('does not write a second complete frame when completion arrives before the recheck resolves', async () => {
      const activeJob = {
        id: JOB_ID,
        knowledgeBaseId: 'kb-1',
        status: 'running',
        importedCount: 0,
        errorLog: [],
        createdAt: new Date(),
      };
      const completedJob = {
        ...activeJob,
        status: 'completed',
        importedCount: 2,
      };

      let resolveRecheck: ((value: unknown) => void) | undefined;
      const delayedRecheckChain = {
        from: vi.fn(),
        where: vi.fn(),
        then: (resolve: (value: unknown) => void) => {
          resolveRecheck = resolve;
          return Promise.resolve();
        },
        catch: vi.fn(),
      };
      delayedRecheckChain.from.mockReturnValue(delayedRecheckChain);
      delayedRecheckChain.where.mockReturnValue(delayedRecheckChain);

      (db.select as Mock)
        .mockReturnValueOnce(createChain([mockKb]))
        .mockReturnValueOnce(createChain([activeJob]))
        .mockReturnValueOnce(delayedRecheckChain);

      const responsePromise = supertest(app)
        .get(`/api/knowledge-bases/kb-1/admin/import/${JOB_ID}/progress`)
        .set('Cookie', `${COOKIE_NAME}=${adminToken}`)
        .then(res => res);

      for (let i = 0; i < 20 && !jobListeners.get(JOB_ID)?.size; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      expect(jobListeners.get(JOB_ID)?.size).toBe(1);
      for (const listener of jobListeners.get(JOB_ID) ?? []) {
        listener({ type: 'complete', imported: 2, errors: 0 });
      }

      resolveRecheck?.([completedJob]);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect((res.text.match(/"type":"complete"/g) ?? [])).toHaveLength(1);
    });
  });
});
