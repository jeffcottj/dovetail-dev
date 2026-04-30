import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, articles, importJobs } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { requireKbAdmin } from '../../middleware/resolveKb.js';
import { validateBody } from '../../utils/validate.js';

export const bulkPublishRouter: Router = Router({ mergeParams: true });

const bulkPublishSchema = z.object({
  importJobId: z.string().uuid().optional(),
});

bulkPublishRouter.post(
  '/',
  authMiddleware,
  requireKbAdmin,
  validateBody(bulkPublishSchema),
  async (req, res) => {
    try {
      const { importJobId } = req.body;
      const now = new Date();
      const kbId = req.params.kbId as string;
      const kbArticleScope = inArray(
        articles.categoryId,
        sql`(SELECT id FROM categories WHERE knowledge_base_id = ${kbId})`,
      );

      let whereClause;
      if (importJobId) {
        const [job] = await db.select().from(importJobs).where(and(
          eq(importJobs.id, importJobId),
          eq(importJobs.knowledgeBaseId, kbId),
        ));
        if (!job) {
          res.status(404).json({ error: 'Import job not found' });
          return;
        }
        whereClause = and(
          eq(articles.status, 'draft'),
          kbArticleScope,
          eq(articles.authorId, job.createdBy),
          gte(articles.updatedAt, job.createdAt),
        );
      } else {
        whereClause = and(eq(articles.status, 'draft'), kbArticleScope);
      }

      const updated = await db.update(articles)
        .set({ status: 'published', publishedAt: now, updatedAt: now, lastEditedById: (req as AuthRequest).user!.id })
        .where(whereClause)
        .returning({ id: articles.id });

      res.json({ published: updated.length });
    } catch (err) {
      console.error('[bulk-publish] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);
