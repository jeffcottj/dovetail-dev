import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db, categories, articles } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';
import type { KbRequest } from '../middleware/resolveKb.js';

export const categoriesRouter: Router = Router({ mergeParams: true });

const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

categoriesRouter.get('/', authMiddleware, async (req: KbRequest, res) => {
  const kbId = req.params.kbId as string;
  const result = await db.select().from(categories).where(eq(categories.knowledgeBaseId, kbId));
  res.json(result);
});

categoriesRouter.post(
  '/',
  authMiddleware,
  requireRole('editor'),
  validateBody(createCategorySchema),
  async (req: KbRequest, res) => {
    const kbId = req.params.kbId as string;
    const { name, parentId } = req.body;
    const slug = toSlug(name);
    try {
      const [created] = await db.insert(categories).values({
        name, slug, parentId: parentId ?? null, knowledgeBaseId: kbId,
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name?.includes('slug')) {
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
        const [created] = await db.insert(categories).values({
          name, slug: uniqueSlug, parentId: parentId ?? null, knowledgeBaseId: kbId,
        }).returning();
        res.status(201).json(created);
      } else {
        throw err;
      }
    }
  },
);

categoriesRouter.patch(
  '/:id',
  authMiddleware,
  requireRole('editor'),
  validateBody(updateCategorySchema),
  async (req: KbRequest, res) => {
    const id = req.params.id as string;
    const kbId = req.params.kbId as string;
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) {
      updates.name = req.body.name;
      updates.slug = toSlug(req.body.name);
    }
    if (req.body.parentId !== undefined) {
      updates.parentId = req.body.parentId;
    }

    const [updated] = await db.update(categories).set(updates).where(and(eq(categories.id, id), eq(categories.knowledgeBaseId, kbId))).returning();
    if (!updated) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(updated);
  },
);

categoriesRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req: KbRequest, res) => {
  const id = req.params.id as string;
  const kbId = req.params.kbId as string;

  const [childCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.parentId, id));
  if (Number(childCount.count) > 0) {
    res.status(409).json({ error: 'Cannot delete category with subcategories. Move or delete them first.' });
    return;
  }

  const [articleCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(eq(articles.categoryId, id));
  if (Number(articleCount.count) > 0) {
    res.status(409).json({ error: 'Cannot delete category with articles. Move or delete them first.' });
    return;
  }

  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.knowledgeBaseId, kbId)));
  res.status(204).end();
});
