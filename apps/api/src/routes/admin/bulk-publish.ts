import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db, articles, importJobs } from '@dovetail/db';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { validateBody } from '../../utils/validate.js';

export const bulkPublishRouter: Router = Router();

const bulkPublishSchema = z.object({
  importJobId: z.string().uuid().optional(),
});

bulkPublishRouter.post(
  '/',
  authMiddleware,
  requireRole('admin'),
  validateBody(bulkPublishSchema),
  async (req, res) => {
    const { importJobId } = req.body;
    const now = new Date();

    let whereClause;
    if (importJobId) {
      const [job] = await db.select().from(importJobs).where(eq(importJobs.id, importJobId));
      if (!job) {
        res.status(404).json({ error: 'Import job not found' });
        return;
      }
      whereClause = sql`${articles.status} = 'draft' AND ${articles.authorId} = ${job.createdBy} AND ${articles.createdAt} >= ${job.createdAt}`;
    } else {
      whereClause = eq(articles.status, 'draft');
    }

    const updated = await db.update(articles)
      .set({ status: 'published', publishedAt: now, updatedAt: now })
      .where(whereClause)
      .returning({ id: articles.id });

    res.json({ published: updated.length });
  },
);
