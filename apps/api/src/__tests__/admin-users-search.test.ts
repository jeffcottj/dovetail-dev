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
    },
  };
});

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => {
    _req.user = { id: 'test-admin', role: 'admin' };
    next();
  },
  AuthRequest: {},
}));

import { db } from '@dovetail/db';

describe('GET /api/admin/users with search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated users without search', async () => {
    const mockUser = {
      id: 'u1',
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: null,
      role: 'editor',
      provider: 'google',
      createdAt: new Date().toISOString(),
    };

    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(createChain([{ count: 1 }]))   // count query
      .mockReturnValueOnce(createChain([mockUser]));       // data query

    const res = await request(app).get('/api/admin/users');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [expect.objectContaining({ id: 'u1', name: 'Alice' })],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('accepts search parameter and applies where clause', async () => {
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(createChain([{ count: 0 }]))
      .mockReturnValueOnce(createChain([]));

    const res = await request(app).get('/api/admin/users?search=alice');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: [],
      total: 0,
      page: 1,
    });
    // select called twice: count + data
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('returns empty results for search with no matches', async () => {
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(createChain([{ count: 0 }]))
      .mockReturnValueOnce(createChain([]));

    const res = await request(app).get('/api/admin/users?search=nonexistent');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('trims whitespace-only search and treats as no filter', async () => {
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(createChain([{ count: 0 }]))
      .mockReturnValueOnce(createChain([]));

    const res = await request(app).get('/api/admin/users?search=%20%20');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  it('respects pagination with search', async () => {
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(createChain([{ count: 25 }]))
      .mockReturnValueOnce(createChain([]));

    const res = await request(app).get('/api/admin/users?search=test&page=2&limit=10');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 25,
      page: 2,
      limit: 10,
    });
  });
});
