import { describe, expect, it, vi, type Mock, beforeEach } from 'vitest';
import express, { type Response } from 'express';
import supertest from 'supertest';
import { createChain } from '../helpers/db-mock.js';

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

import { db } from '@dovetail/db';
import { resolveKb, type KbRequest } from '../../middleware/resolveKb.js';

function buildApp() {
  const app = express();
  app.get('/api/knowledge-bases/:kbId/test', resolveKb, (req: KbRequest, res: Response) => {
    res.json({ kbId: req.kb!.id, kbName: req.kb!.name });
  });
  return app;
}

describe('resolveKb middleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches KB to request when valid kbId', async () => {
    const mockKb = {
      id: 'kb-1',
      name: 'Test KB',
      slug: 'test-kb',
      description: null,
      defaultAccess: 'org_viewer' as const,
      createdAt: new Date(),
    };
    (db.select as Mock).mockReturnValue(createChain([mockKb]));

    const res = await supertest(buildApp()).get('/api/knowledge-bases/kb-1/test');
    expect(res.status).toBe(200);
    expect(res.body.kbId).toBe('kb-1');
  });

  it('returns 404 when KB not found', async () => {
    (db.select as Mock).mockReturnValue(createChain([]));

    const res = await supertest(buildApp()).get('/api/knowledge-bases/nonexistent/test');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Knowledge base not found');
  });
});
