import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, categories, knowledgeBases } from '@dovetail/db';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import type { ApiKeyRequest } from '../middleware/apiKeyAuth.js';
import { validateBody } from '../utils/validate.js';
import { createEmbeddingProvider } from '../services/embeddings.js';
import { buildCategoryPath } from '../utils/category-path.js';

export const ragRouter: Router = Router();

const ragSearchSchema = z.object({
  query: z.string().min(1).max(5000),
  limit: z.number().int().min(1).max(50).default(5),
  knowledgeBaseIds: z.array(z.string().uuid()).min(1),
  categoryIds: z.array(z.string().uuid()).optional(),
});

ragRouter.post('/search', apiKeyAuth, validateBody(ragSearchSchema), async (req: ApiKeyRequest, res) => {
  const { query, limit, knowledgeBaseIds, categoryIds } = req.body;

  // Validate API key has access to requested KBs
  const unauthorized = knowledgeBaseIds.filter((id: string) => !req.allowedKbIds?.includes(id));
  if (unauthorized.length > 0) {
    res.status(403).json({ error: 'API key does not have access to requested knowledge base(s)' });
    return;
  }

  // Embed the query
  const provider = createEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // Scope to KBs via categories
  const kbFilter = sql`AND a.category_id IN (SELECT id FROM categories WHERE knowledge_base_id = ANY(${knowledgeBaseIds}::uuid[]))`;
  const categoryFilter = categoryIds?.length
    ? sql`AND a.category_id = ANY(${categoryIds}::uuid[])`
    : sql``;

  const results = await db.execute(sql`
    SELECT ae.article_id, ae.chunk_text, ae.chunk_index,
           1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
           a.title, a.slug, a.category_id, a.updated_at,
           a.last_edited_by_id, u.name AS last_edited_by_name, u.email AS last_edited_by_email
    FROM article_embeddings ae
    JOIN articles a ON a.id = ae.article_id
    LEFT JOIN users u ON u.id = a.last_edited_by_id
    WHERE a.status = 'published' ${kbFilter} ${categoryFilter}
    ORDER BY ae.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  const formatted = await Promise.all(
    (results as any[]).map(async (r) => {
      const categoryPath = await buildCategoryPath(r.category_id);
      // Get KB slug for URL
      const [cat] = await db.select({ knowledgeBaseId: categories.knowledgeBaseId })
        .from(categories).where(eq(categories.id, r.category_id));
      const [kb] = cat ? await db.select({ slug: knowledgeBases.slug })
        .from(knowledgeBases).where(eq(knowledgeBases.id, cat.knowledgeBaseId)) : [null];

      return {
        articleId: r.article_id,
        articleTitle: r.title,
        articleUrl: `/kb/${kb?.slug ?? 'default'}/articles/${categoryPath.join('/')}/${r.slug}`,
        categoryPath,
        lastEditedAt: r.updated_at,
        lastEditedById: r.last_edited_by_id,
        lastEditedByName: r.last_edited_by_name,
        lastEditedByEmail: r.last_edited_by_email,
        chunkText: r.chunk_text,
        score: parseFloat(r.similarity),
      };
    }),
  );

  res.json({ results: formatted });
});
