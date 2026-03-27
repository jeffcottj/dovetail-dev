import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { createChain } from './helpers/db-mock.js';

vi.mock('@dovetail/db', async () => {
  const actual = await vi.importActual('@dovetail/db');
  return {
    ...actual,
    db: {
      select: vi.fn(),
      execute: vi.fn(),
    },
  };
});

vi.mock('../utils/category-path.js', () => ({
  resolveCategoryPath: vi.fn(),
  buildCategoryPath: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => {
    _req.user = { id: 'user-1', role: 'admin' };
    next();
  },
  AuthRequest: {},
}));

import { db } from '@dovetail/db';
import { resolveCategoryPath } from '../utils/category-path.js';
const resolveMock = resolveCategoryPath as ReturnType<typeof vi.fn>;

const mockKb = { id: 'kb-1', name: 'Default', slug: 'default', description: null, createdAt: new Date() };

describe('GET /api/knowledge-bases/:kbId/articles/by-path/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when category path does not resolve', async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(createChain([mockKb]));
    resolveMock.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/knowledge-bases/kb-1/articles/by-path/nonexistent/article');
    expect(res.status).toBe(404);
  });

  it('returns 400 when path has fewer than 2 segments', async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce(createChain([mockKb]));
    const res = await request(app).get('/api/knowledge-bases/kb-1/articles/by-path/only-one');
    expect(res.status).toBe(400);
  });
});
