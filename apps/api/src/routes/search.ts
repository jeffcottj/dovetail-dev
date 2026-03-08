import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db, articles } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import { validateQuery } from '../utils/validate.js';
import { paginationSchema, paginate } from '../utils/pagination.js';
import { createEmbeddingProvider } from '../services/embeddings.js';

export const searchRouter: Router = Router();

const searchQuerySchema = paginationSchema.extend({
  q: z.string().min(1),
  mode: z.enum(['fulltext', 'semantic', 'hybrid']).default('fulltext'),
  categoryId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Reciprocal Rank Fusion — merges two ranked lists into one
function reciprocalRankFusion(
  fulltextResults: { id: string }[],
  semanticResults: { id: string }[],
  k = 60,
): string[] {
  const scores = new Map<string, number>();

  fulltextResults.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + rank + 1));
  });
  semanticResults.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + rank + 1));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

// Build WHERE conditions shared by fulltext and hybrid modes
function buildFilterConditions(params: {
  categoryId?: string;
  authorId?: string;
  from?: string;
  to?: string;
}) {
  const conditions: ReturnType<typeof eq>[] = [];
  conditions.push(eq(articles.status, 'published'));
  if (params.categoryId) conditions.push(eq(articles.categoryId, params.categoryId));
  if (params.authorId) conditions.push(eq(articles.authorId, params.authorId));
  if (params.from) conditions.push(gte(articles.createdAt, new Date(params.from)));
  if (params.to) conditions.push(lte(articles.createdAt, new Date(params.to)));
  return conditions;
}

// Full-text search using tsvector
async function fulltextSearch(q: string, conditions: ReturnType<typeof eq>[], limit: number, offset: number) {
  conditions.push(sql`search_vector @@ websearch_to_tsquery('english', ${q})`);
  const whereClause = and(...conditions);

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(whereClause);

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

  return { data, total: Number(total) };
}

// Semantic search using pgvector cosine similarity
async function semanticSearch(q: string, limit: number, categoryId?: string) {
  const provider = createEmbeddingProvider();
  const queryEmbedding = await provider.embed(q);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const categoryFilter = categoryId
    ? sql`AND a.category_id = ${categoryId}`
    : sql``;

  const results = await db.execute(sql`
    SELECT ae.article_id, ae.chunk_text,
           1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
           a.title, a.slug, a.category_id, a.author_id,
           a.status, a.created_at, a.updated_at
    FROM article_embeddings ae
    JOIN articles a ON a.id = ae.article_id
    WHERE a.status = 'published' ${categoryFilter}
    ORDER BY ae.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  return (results as any[]).map((r) => ({
    id: r.article_id,
    title: r.title,
    slug: r.slug,
    categoryId: r.category_id,
    authorId: r.author_id,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    chunkText: r.chunk_text,
    similarity: parseFloat(r.similarity),
  }));
}

searchRouter.get('/', authMiddleware, validateQuery(searchQuerySchema), async (_req, res) => {
  const { q, mode, categoryId, authorId, from, to, page, limit } = res.locals.query as z.infer<typeof searchQuerySchema>;
  const offset = (page - 1) * limit;

  if (mode === 'fulltext') {
    const conditions = buildFilterConditions({ categoryId, authorId, from, to });
    const { data, total } = await fulltextSearch(q, conditions, limit, offset);
    res.json(paginate(data, total, { page, limit }));
    return;
  }

  if (mode === 'semantic') {
    const results = await semanticSearch(q, limit, categoryId);
    res.json(paginate(results, results.length, { page, limit }));
    return;
  }

  // mode === 'hybrid': run both in parallel, merge with RRF
  const conditions = buildFilterConditions({ categoryId, authorId, from, to });
  const [fulltextResult, semanticResults] = await Promise.all([
    fulltextSearch(q, conditions, limit, offset),
    semanticSearch(q, limit, categoryId),
  ]);

  const rankedIds = reciprocalRankFusion(fulltextResult.data, semanticResults);

  // Build a lookup from both result sets
  const resultMap = new Map<string, any>();
  for (const r of fulltextResult.data) {
    resultMap.set(r.id, r);
  }
  for (const r of semanticResults) {
    if (!resultMap.has(r.id)) {
      resultMap.set(r.id, r);
    }
  }

  // Return results in RRF order, paginated
  const mergedData = rankedIds
    .filter((id) => resultMap.has(id))
    .map((id) => resultMap.get(id)!);

  res.json(paginate(mergedData, mergedData.length, { page, limit }));
});
