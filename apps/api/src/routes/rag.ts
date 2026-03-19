import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@dovetail/db';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import { validateBody } from '../utils/validate.js';
import { createEmbeddingProvider } from '../services/embeddings.js';
import { buildCategoryPath } from '../utils/category-path.js';

export const ragRouter: Router = Router();

const ragSearchSchema = z.object({
  query: z.string().min(1).max(5000),
  limit: z.number().int().min(1).max(50).default(5),
  categoryIds: z.array(z.string().uuid()).optional(),
});

ragRouter.post('/search', apiKeyAuth, validateBody(ragSearchSchema), async (req, res) => {
  const { query, limit, categoryIds } = req.body;

  // Embed the query
  const provider = createEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // Build optional category filter
  const categoryFilter = categoryIds?.length
    ? sql`AND a.category_id = ANY(${categoryIds}::uuid[])`
    : sql``;

  const results = await db.execute(sql`
    SELECT ae.article_id, ae.chunk_text, ae.chunk_index,
           1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
           a.title, a.slug, a.category_id
    FROM article_embeddings ae
    JOIN articles a ON a.id = ae.article_id
    WHERE a.status = 'published' ${categoryFilter}
    ORDER BY ae.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  const formatted = await Promise.all(
    (results as any[]).map(async (r) => {
      const categoryPath = await buildCategoryPath(r.category_id);
      return {
        articleId: r.article_id,
        articleTitle: r.title,
        articleUrl: `/articles/${categoryPath.join('/')}/${r.slug}`,
        categoryPath,
        chunkText: r.chunk_text,
        score: parseFloat(r.similarity),
      };
    }),
  );

  res.json({ results: formatted });
});
