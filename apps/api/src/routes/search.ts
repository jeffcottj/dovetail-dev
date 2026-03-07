import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db, articles } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import { validateQuery } from '../utils/validate.js';
import { paginationSchema, paginate } from '../utils/pagination.js';

export const searchRouter: Router = Router();

const searchQuerySchema = paginationSchema.extend({
  q: z.string().min(1),
  categoryId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

searchRouter.get('/', authMiddleware, validateQuery(searchQuerySchema), async (_req, res) => {
  const { q, categoryId, authorId, from, to, page, limit } = res.locals.query as z.infer<typeof searchQuerySchema>;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];

  // Full-text search condition
  conditions.push(sql`search_vector @@ websearch_to_tsquery('english', ${q})`);

  // Only published articles
  conditions.push(eq(articles.status, 'published'));

  // Optional filters
  if (categoryId) conditions.push(eq(articles.categoryId, categoryId));
  if (authorId) conditions.push(eq(articles.authorId, authorId));
  if (from) conditions.push(gte(articles.createdAt, new Date(from)));
  if (to) conditions.push(lte(articles.createdAt, new Date(to)));

  const whereClause = and(...conditions);

  // Count total matches
  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(whereClause);

  // Fetch ranked results
  const data = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      categoryId: articles.categoryId,
      authorId: articles.authorId,
      status: articles.status,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
      rank: sql<number>`ts_rank(search_vector, websearch_to_tsquery('english', ${q}))`,
    })
    .from(articles)
    .where(whereClause)
    .orderBy(sql`ts_rank(search_vector, websearch_to_tsquery('english', ${q})) DESC`)
    .limit(limit)
    .offset(offset);

  res.json(paginate(data, Number(total), { page, limit }));
});
