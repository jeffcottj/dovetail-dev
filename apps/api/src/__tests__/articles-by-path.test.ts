import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

vi.mock('@dovetail/db', async () => {
  const actual = await vi.importActual('@dovetail/db');
  const selectMock = vi.fn();
  return {
    ...actual,
    db: {
      select: selectMock,
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

import { resolveCategoryPath } from '../utils/category-path.js';
const resolveMock = resolveCategoryPath as ReturnType<typeof vi.fn>;

describe('GET /api/articles/by-path/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when category path does not resolve', async () => {
    resolveMock.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/articles/by-path/nonexistent/article');
    expect(res.status).toBe(404);
  });

  it('returns 400 when path has fewer than 2 segments', async () => {
    const res = await request(app).get('/api/articles/by-path/only-one');
    expect(res.status).toBe(400);
  });
});
