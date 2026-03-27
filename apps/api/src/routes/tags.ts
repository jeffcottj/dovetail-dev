import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, tags, articleTags } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';

export const tagsRouter: Router = Router({ mergeParams: true });

const createTagSchema = z.object({
  name: z.string().min(1).max(100),
});

const assignTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1),
});

// GET /api/knowledge-bases/:kbId/tags — list all tags
tagsRouter.get('/', authMiddleware, async (req, res) => {
  const kbId = req.params.kbId as string;
  const result = await db.select().from(tags).where(eq(tags.knowledgeBaseId, kbId));
  res.json(result);
});

// POST /api/knowledge-bases/:kbId/tags — create tag
tagsRouter.post('/', authMiddleware, requireRole('editor'), validateBody(createTagSchema), async (req, res) => {
  const { name } = req.body;
  const slug = toSlug(name);
  const kbId = req.params.kbId as string;
  try {
    const [created] = await db.insert(tags).values({ name, slug, knowledgeBaseId: kbId }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    if (err.code === '23505') {
      const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
      const [created] = await db.insert(tags).values({ name, slug: uniqueSlug, knowledgeBaseId: kbId }).returning();
      res.status(201).json(created);
    } else {
      throw err;
    }
  }
});

// DELETE /api/tags/:id — delete tag
tagsRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const id = req.params.id as string;
  await db.delete(tags).where(eq(tags.id, id));
  res.status(204).end();
});

// GET /api/articles/:id/tags — list tags for article
export const articleTagsRouter: Router = Router({ mergeParams: true });

articleTagsRouter.get('/', authMiddleware, async (req, res) => {
  const articleId = req.params.id as string;
  const result = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(eq(articleTags.articleId, articleId));
  res.json(result);
});

// POST /api/articles/:id/tags — assign tags to article
articleTagsRouter.post('/', authMiddleware, requireRole('editor'), validateBody(assignTagsSchema), async (req, res) => {
  const articleId = req.params.id as string;
  const { tagIds } = req.body;

  const values = tagIds.map((tagId: string) => ({ articleId, tagId }));
  await db.insert(articleTags).values(values).onConflictDoNothing();

  res.status(201).json({ message: 'Tags assigned' });
});

// DELETE /api/articles/:id/tags/:tagId — remove tag from article
articleTagsRouter.delete('/:tagId', authMiddleware, requireRole('editor'), async (req, res) => {
  const articleId = req.params.id as string;
  const tagId = req.params.tagId as string;

  await db.delete(articleTags).where(
    and(eq(articleTags.articleId, articleId), eq(articleTags.tagId, tagId)),
  );

  res.status(204).end();
});
