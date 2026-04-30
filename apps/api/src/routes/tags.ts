import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, articles, categories, tags, articleTags } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { canEditArticle, canManageKnowledgeBaseContent, canReadArticle } from '../services/permissions.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';
import type { Role } from '@dovetail/types';

export const tagsRouter: Router = Router({ mergeParams: true });

const createTagSchema = z.object({
  name: z.string().min(1).max(100),
});

const assignTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1),
});

async function loadScopedArticleForTags(req: AuthRequest, res: any) {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const [article] = await db.select({
    id: articles.id,
    categoryId: articles.categoryId,
    status: articles.status,
    knowledgeBaseId: categories.knowledgeBaseId,
  })
    .from(articles)
    .innerJoin(categories, eq(articles.categoryId, categories.id))
    .where(eq(articles.id, articleId));

  if (!article || article.knowledgeBaseId !== kbId) {
    res.status(404).json({ error: 'Article not found' });
    return null;
  }

  return article;
}

// GET /api/knowledge-bases/:kbId/tags — list all tags
tagsRouter.get('/', authMiddleware, async (req, res) => {
  const kbId = req.params.kbId as string;
  const result = await db.select().from(tags).where(eq(tags.knowledgeBaseId, kbId));
  res.json(result);
});

// POST /api/knowledge-bases/:kbId/tags — create tag
tagsRouter.post('/', authMiddleware, validateBody(createTagSchema), async (req: AuthRequest, res) => {
  const { name } = req.body;
  const slug = toSlug(name);
  const kbId = req.params.kbId as string;
  const canManage = await canManageKnowledgeBaseContent({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    knowledgeBaseId: kbId,
    requiredRole: 'editor',
  });
  if (!canManage) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

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
tagsRouter.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const kbId = req.params.kbId as string;
  const canManage = await canManageKnowledgeBaseContent({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    knowledgeBaseId: kbId,
    requiredRole: 'admin',
  });
  if (!canManage) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await db.delete(tags).where(and(eq(tags.id, id), eq(tags.knowledgeBaseId, kbId)));
  res.status(204).end();
});

// GET /api/articles/:id/tags — list tags for article
export const articleTagsRouter: Router = Router({ mergeParams: true });

articleTagsRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const article = await loadScopedArticleForTags(req, res);
  if (!article) return;

  const canRead = await canReadArticle({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    categoryId: article.categoryId,
    knowledgeBaseId: article.knowledgeBaseId,
    status: article.status,
  });
  if (!canRead) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  const result = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(eq(articleTags.articleId, articleId));
  res.json(result);
});

// POST /api/articles/:id/tags — assign tags to article
articleTagsRouter.post('/', authMiddleware, validateBody(assignTagsSchema), async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const kbId = req.params.kbId as string;
  const { tagIds } = req.body;
  const article = await loadScopedArticleForTags(req, res);
  if (!article) return;

  const canEdit = await canEditArticle({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    categoryId: article.categoryId,
    knowledgeBaseId: article.knowledgeBaseId,
  });
  if (!canEdit) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const validTags = await db.select({ id: tags.id }).from(tags).where(eq(tags.knowledgeBaseId, kbId));
  const validTagIds = new Set(validTags.map((tag) => tag.id));
  if (tagIds.some((tagId: string) => !validTagIds.has(tagId))) {
    res.status(400).json({ error: 'All tags must belong to the current knowledge base' });
    return;
  }

  const values = tagIds.map((tagId: string) => ({ articleId, tagId }));
  await db.insert(articleTags).values(values).onConflictDoNothing();

  res.status(201).json({ message: 'Tags assigned' });
});

// DELETE /api/articles/:id/tags/:tagId — remove tag from article
articleTagsRouter.delete('/:tagId', authMiddleware, async (req: AuthRequest, res) => {
  const articleId = req.params.id as string;
  const tagId = req.params.tagId as string;
  const article = await loadScopedArticleForTags(req, res);
  if (!article) return;

  const canEdit = await canEditArticle({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    categoryId: article.categoryId,
    knowledgeBaseId: article.knowledgeBaseId,
  });
  if (!canEdit) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  await db.delete(articleTags).where(
    and(eq(articleTags.articleId, articleId), eq(articleTags.tagId, tagId)),
  );

  res.status(204).end();
});
