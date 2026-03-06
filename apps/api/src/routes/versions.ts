import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db, articles, articleVersions } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateQuery } from '../utils/validate.js';
import { paginationSchema, paginate } from '../utils/pagination.js';

export const versionsRouter: Router = Router({ mergeParams: true });

// GET /api/articles/:id/versions — paginated list
versionsRouter.get('/', authMiddleware, validateQuery(paginationSchema), async (req, res) => {
  const articleId = req.params.id as string;
  const { page, limit } = res.locals.query as { page: number; limit: number };
  const offset = (page - 1) * limit;

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId));

  const data = await db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId))
    .orderBy(sql`${articleVersions.versionNumber} DESC`)
    .limit(limit)
    .offset(offset);

  res.json(paginate(data, Number(total), { page, limit }));
});

// GET /api/articles/:id/versions/:versionId
versionsRouter.get('/:versionId', authMiddleware, async (req, res) => {
  const versionId = req.params.versionId as string;
  const [version] = await db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.id, versionId));

  if (!version) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  res.json(version);
});

// POST /api/articles/:id/versions/:versionId/restore
versionsRouter.post('/:versionId/restore', authMiddleware, requireRole('editor'), async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const versionId = req.params.versionId as string;

  let result: any;
  await db.transaction(async (tx) => {
    // 1. Fetch the old version to restore
    const [oldVersion] = await tx.select().from(articleVersions).where(eq(articleVersions.id, versionId));
    if (!oldVersion) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    // 2. Fetch current article content
    const [current] = await tx.select().from(articles).where(eq(articles.id, articleId));
    if (!current) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }

    // 3. Compute next version number
    const [maxVersion] = await tx
      .select({ max: sql<number>`coalesce(max(version_number), 0)` })
      .from(articleVersions)
      .where(eq(articleVersions.articleId, articleId));
    const nextVersion = (maxVersion?.max ?? 0) + 1;

    // 4. Save current content as a new version (snapshot before overwrite)
    await tx.insert(articleVersions).values({
      articleId,
      title: current.title,
      content: current.content,
      authorId: req.user!.id,
      versionNumber: nextVersion,
    });

    // 5. Overwrite article with old version's content
    const [restored] = await tx.update(articles).set({
      title: oldVersion.title,
      content: oldVersion.content,
      updatedAt: new Date(),
    }).where(eq(articles.id, articleId)).returning();

    result = restored;
  });

  if (!res.headersSent) {
    res.json(result);
  }
});
