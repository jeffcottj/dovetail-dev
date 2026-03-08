import { createHash } from 'node:crypto';
import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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

import { app } from '../../app.js';
import { db } from '@dovetail/db';

const TEST_API_KEY = 'test-api-key-abc123';
const TEST_KEY_HASH = createHash('sha256').update(TEST_API_KEY).digest('hex');
const KEY_ID = '00000000-0000-4000-8000-000000000099';

describe('apiKeyAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await supertest(app).post('/api/v1/rag/search').send({ query: 'test' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing API key');
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const res = await supertest(app)
      .post('/api/v1/rag/search')
      .set('Authorization', 'Basic abc123')
      .send({ query: 'test' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing API key');
  });

  it('returns 401 when API key not found in database', async () => {
    const chain = createChain([]);
    (db.select as Mock).mockReturnValueOnce(chain);

    const res = await supertest(app)
      .post('/api/v1/rag/search')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ query: 'test' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or revoked API key');
  });

  it('returns 401 when API key is revoked', async () => {
    const chain = createChain([{
      id: KEY_ID,
      name: 'Test Key',
      keyHash: TEST_KEY_HASH,
      createdBy: 'user-1',
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: new Date(), // revoked
    }]);
    (db.select as Mock).mockReturnValueOnce(chain);

    const res = await supertest(app)
      .post('/api/v1/rag/search')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({ query: 'test' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or revoked API key');
  });
});
