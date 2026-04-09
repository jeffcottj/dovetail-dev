import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import { validateQuery } from '../utils/validate.js';
import { paginationSchema, paginate } from '../utils/pagination.js';
import { normalizeAdminActivityRow, type AdminActivityRow } from '../services/admin-activity.js';
import { buildCategoryPath } from '../utils/category-path.js';
import type { WorkspaceSearchResult } from '@dovetail/types';

export const workspaceRouter: Router = Router();

const workspaceSearchSchema = paginationSchema.extend({
  q: z.string().min(1),
});

workspaceRouter.get('/activity', authMiddleware, async (_req, res) => {
  const activityRows = await db.execute(sql`
    SELECT
      e.id,
      e.kind,
      e.created_at AS "createdAt",
      e.actor_id AS "actorId",
      u.name AS "actorName",
      u.email AS "actorEmail",
      e.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      e.subject_id AS "subjectId",
      e.subject_label AS "subjectLabel",
      e.metadata
    FROM admin_activity_events e
    INNER JOIN users u ON u.id = e.actor_id
    LEFT JOIN knowledge_bases kb ON kb.id = e.knowledge_base_id
    WHERE e.kind IN ('article.created', 'article.edited')
    ORDER BY e.created_at DESC
    LIMIT 20
  `);

  const articleActivityRows = (activityRows as unknown as AdminActivityRow[]).filter(
    (row) => row.kind === 'article.created' || row.kind === 'article.edited',
  );

  res.json(articleActivityRows.map(normalizeAdminActivityRow));
});

workspaceRouter.get('/search', authMiddleware, validateQuery(workspaceSearchSchema), async (_req, res) => {
  const { q, page, limit } = res.locals.query as z.infer<typeof workspaceSearchSchema>;
  const offset = (page - 1) * limit;

  const [{ count: total }] = (await db.execute(sql`
    SELECT count(*) AS count
    FROM articles a
    INNER JOIN categories c ON c.id = a.category_id
    INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
    WHERE a.status = 'published'
      AND a.search_vector @@ websearch_to_tsquery('english', ${q})
  `)) as unknown as Array<{ count: string | number }>;

  const rows = (await db.execute(sql`
    SELECT
      a.id,
      a.title,
      a.slug,
      a.category_id AS "categoryId",
      c.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      kb.slug AS "knowledgeBaseSlug",
      a.author_id AS "authorId",
      a.status,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      ts_rank(a.search_vector, websearch_to_tsquery('english', ${q})) AS rank,
      count(*) OVER() AS total
    FROM articles a
    INNER JOIN categories c ON c.id = a.category_id
    INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
    WHERE a.status = 'published'
      AND a.search_vector @@ websearch_to_tsquery('english', ${q})
    ORDER BY ts_rank(a.search_vector, websearch_to_tsquery('english', ${q})) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `)) as unknown as WorkspaceSearchResult[];

  const data = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      categoryPath: await buildCategoryPath(row.categoryId),
    })),
  );

  res.json(
    paginate(
      data,
      Number(total),
      { page, limit },
    ),
  );
});
