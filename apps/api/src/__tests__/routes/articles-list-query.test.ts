import supertest from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createChain } from '../helpers/db-mock.js';
import { COOKIE_NAME, makeToken } from '../helpers/token.js';

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

vi.mock('../../utils/category-path.js', () => ({
  resolveCategoryPath: vi.fn(),
  buildCategoryPath: vi.fn(),
}));

import { app } from '../../app.js';
import { db } from '@dovetail/db';
import { buildCategoryPath } from '../../utils/category-path.js';

const CAT_ID = '00000000-0000-4000-8000-000000000001';
const ART_ID = '00000000-0000-4000-8000-000000000010';

const mockKb = {
  id: 'kb-1',
  name: 'Default',
  slug: 'default',
  description: null,
  defaultAccess: 'org_viewer',
  createdAt: new Date(),
};

const mockArticle = {
  id: ART_ID,
  title: 'Nested Article',
  slug: 'nested-article',
  categoryId: CAT_ID,
  authorId: 'user-1',
  content: { type: 'doc', content: [] },
  status: 'published' as const,
  plainText: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
};

describe('Article list query options', () => {
  let viewerToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    viewerToken = await makeToken({ sub: 'user-1', role: 'viewer' });
    (buildCategoryPath as Mock).mockResolvedValue(['housing', 'evictions']);
  });

  it('accepts descendant category scope with alphabetical sorting', async () => {
    const dataChain = createChain([mockArticle]);
    (db.select as Mock)
      .mockReturnValueOnce(createChain([mockKb]))
      .mockReturnValueOnce(createChain([{ count: 1 }]))
      .mockReturnValueOnce(dataChain);

    const res = await supertest(app)
      .get(`/api/knowledge-bases/kb-1/articles?page=1&limit=10&categoryId=${CAT_ID}&includeDescendants=true&sortBy=title`)
      .set('Cookie', `${COOKIE_NAME}=${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].categoryPath).toEqual(['housing', 'evictions']);
    expect(dataChain.orderBy).toHaveBeenCalled();
  });
});
