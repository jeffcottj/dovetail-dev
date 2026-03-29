import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { adminActivityEvents, db, articles, articleVersions, categories } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { buildAdminActivityInsert } from '../services/admin-activity.js';
import { validateBody, validateQuery } from '../utils/validate.js';
import { paginationSchema, paginate } from '../utils/pagination.js';
import { toSlug } from '../utils/slug.js';
import { extractText } from '../utils/tiptap.js';
import { resolveCategoryPath, buildCategoryPath } from '../utils/category-path.js';
import { resolveRole, hasMinimumRole } from '../services/permissions.js';
import { generateEmbeddings } from '../services/embedding-pipeline.js';
import type { Role } from '@dovetail/types';

export const articlesRouter: Router = Router({ mergeParams: true });

const ARTICLE_UPDATE_NOT_FOUND = 'ARTICLE_UPDATE_NOT_FOUND';
const ARTICLE_UPDATE_CONFLICT = 'ARTICLE_UPDATE_CONFLICT';
const ARTICLE_DESTINATION_NOT_FOUND = 'ARTICLE_DESTINATION_NOT_FOUND';
const ARTICLE_DESTINATION_FORBIDDEN = 'ARTICLE_DESTINATION_FORBIDDEN';

function isCategoryReferenceConflict(err: any) {
  return err?.code === '23503';
}

function buildArticleCurrentStatePredicate(current: {
  id: string;
  title: string;
  categoryId: string;
  content: unknown;
  status: 'draft' | 'published' | 'archived';
  publishedAt: Date | null;
}) {
  return and(
    eq(articles.id, current.id),
    eq(articles.categoryId, current.categoryId),
    eq(articles.title, current.title),
    eq(articles.content, current.content as Record<string, unknown>),
    eq(articles.status, current.status),
    current.publishedAt === null
      ? isNull(articles.publishedAt)
      : eq(articles.publishedAt, current.publishedAt),
  );
}

const createArticleSchema = z.object({
  title: z.string().min(1).max(500),
  categoryId: z.string().uuid(),
  content: z.record(z.string(), z.unknown()).default({}),
});

const updateArticleSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  categoryId: z.string().uuid().optional(),
});

const listQuerySchema = paginationSchema.extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  categoryId: z.string().uuid().optional(),
});

async function loadScopedEditorArticle(req: AuthRequest, res: any, id: string) {
  const [article] = await db.select().from(articles).where(eq(articles.id, id));
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return null;
  }

  const [category] = await db.select({ knowledgeBaseId: categories.knowledgeBaseId })
    .from(categories)
    .where(eq(categories.id, article.categoryId));

  const kbId = req.params.kbId as string | undefined;
  if (kbId && category?.knowledgeBaseId !== kbId) {
    res.status(404).json({ error: 'Article not found' });
    return null;
  }

  const effectiveRole = await resolveRole(
    req.user!.id, article.categoryId, category?.knowledgeBaseId, req.user!.role as Role,
  );
  if (!hasMinimumRole(effectiveRole, 'editor')) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return article;
}

// GET /api/articles — paginated list
articlesRouter.get('/', authMiddleware, validateQuery(listQuerySchema), async (req, res) => {
  const { page, limit, status, categoryId } = res.locals.query as z.infer<typeof listQuerySchema>;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(articles.status, status));
  if (categoryId) conditions.push(eq(articles.categoryId, categoryId));

  const kbId = req.params.kbId as string | undefined;
  if (kbId) {
    conditions.push(
      inArray(articles.categoryId, sql`(SELECT id FROM categories WHERE knowledge_base_id = ${kbId})`),
    );
  }

  const whereClause = conditions.length > 0
    ? sql`${sql.join(conditions, sql` AND `)}`
    : undefined;

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(whereClause);

  const data = await db
    .select()
    .from(articles)
    .where(whereClause)
    .orderBy(sql`${articles.updatedAt} DESC`)
    .limit(limit)
    .offset(offset);

  // Enrich with category paths
  const enriched = await Promise.all(
    data.map(async (article) => ({
      ...article,
      categoryPath: await buildCategoryPath(article.categoryId),
    })),
  );

  res.json(paginate(enriched, Number(total), { page, limit }));
});

// GET /api/articles/by-path/* — resolve article via category path + article slug
articlesRouter.get('/by-path/{*path}', authMiddleware, async (req, res) => {
  const pathParam = (req.params as any).path;
  // Express 5 wildcard params may be a string or array depending on path-to-regexp version
  const segments = Array.isArray(pathParam)
    ? pathParam.filter(Boolean)
    : String(pathParam).split('/').filter(Boolean);

  if (segments.length < 2) {
    res.status(400).json({ error: 'Path must include at least a category and article slug' });
    return;
  }

  const categorySegments = segments.slice(0, -1);
  const articleSlug = segments[segments.length - 1];

  const kbId = req.params.kbId as string | undefined;
  const categoryId = await resolveCategoryPath(categorySegments, kbId);
  if (!categoryId) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, articleSlug), eq(articles.categoryId, categoryId)));

  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  const categoryPath = await buildCategoryPath(article.categoryId);
  res.json({ ...article, categoryPath });
});

// GET /api/articles/:id
articlesRouter.get('/:id', authMiddleware, async (req, res) => {
  const id = req.params.id as string;
  const [article] = await db.select().from(articles).where(eq(articles.id, id));
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }
  const categoryPath = await buildCategoryPath(article.categoryId);
  res.json({ ...article, categoryPath });
});

// POST /api/articles — create draft
articlesRouter.post('/', authMiddleware, validateBody(createArticleSchema), async (req: AuthRequest, res) => {
  const { title, categoryId, content } = req.body;
  const slug = toSlug(title);
  const kbId = req.params.kbId as string | undefined;

  const plainText = extractText(content);

  const createDraftArticle = async (articleSlug: string) => db.transaction(async (tx) => {
    const [category] = await tx
      .select({ knowledgeBaseId: categories.knowledgeBaseId })
      .from(categories)
      .where(eq(categories.id, categoryId));

    if (!category || (kbId && category.knowledgeBaseId !== kbId)) {
      throw new Error(ARTICLE_DESTINATION_NOT_FOUND);
    }

    const effectiveRole = await resolveRole(
      req.user!.id, categoryId, category.knowledgeBaseId, req.user!.role as Role,
    );
    if (!hasMinimumRole(effectiveRole, 'editor')) {
      throw new Error(ARTICLE_DESTINATION_FORBIDDEN);
    }

    let created;
    try {
      [created] = await tx.insert(articles).values({
        title,
        slug: articleSlug,
        categoryId,
        authorId: req.user!.id,
        content,
        plainText,
        status: 'draft',
      }).returning();
    } catch (err: any) {
      if (isCategoryReferenceConflict(err)) {
        throw new Error(ARTICLE_DESTINATION_NOT_FOUND);
      }
      throw err;
    }

    if (!created) {
      throw new Error('Article creation failed');
    }
    await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
      kind: 'article.created',
      actorId: req.user!.id,
      knowledgeBaseId: category?.knowledgeBaseId,
      subjectId: created.id,
      subjectLabel: created.title,
      metadata: { articleId: created.id },
    }));
    return created;
  });

  const handleCreateError = (err: Error) => {
    if (err.message === ARTICLE_DESTINATION_NOT_FOUND) {
      res.status(404).json({ error: 'Category not found' });
      return true;
    }

    if (err.message === ARTICLE_DESTINATION_FORBIDDEN) {
      res.status(403).json({ error: 'Forbidden' });
      return true;
    }

    return false;
  };

  try {
    let created;
    try {
      created = await createDraftArticle(slug);
    } catch (err: any) {
      if (handleCreateError(err)) {
        return;
      }

      if (!(err.code === '23505' && err.constraint_name?.includes('slug'))) {
        throw err;
      }

      const uniqueSlug = `${slug}-${Date.now().toString(36)}`;

      try {
        created = await createDraftArticle(uniqueSlug);
      } catch (retryErr: any) {
        if (handleCreateError(retryErr)) {
          return;
        }

        throw retryErr;
      }
    }

    void generateEmbeddings(created.id).catch(err => console.error('Embedding generation failed:', err));
    const categoryPath = await buildCategoryPath(created.categoryId);
    res.status(201).json({ ...created, categoryPath });
  } catch (err: any) {
    throw err;
  }
});

// PATCH /api/articles/:id — update (creates version)
articlesRouter.patch('/:id', authMiddleware, validateBody(updateArticleSchema), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const kbId = req.params.kbId as string | undefined;

  let result: any;
  let didChange = false;
  try {
    await db.transaction(async (tx) => {
      // 1. Fetch current article
      const [current] = await tx.select().from(articles).where(eq(articles.id, id));
      if (!current) {
        res.status(404).json({ error: 'Article not found' });
        return;
      }

      // 2. Per-category RBAC check
      const [cat] = await tx.select({ knowledgeBaseId: categories.knowledgeBaseId })
        .from(categories)
        .where(eq(categories.id, current.categoryId));

      if (kbId && cat?.knowledgeBaseId !== kbId) {
        res.status(404).json({ error: 'Article not found' });
        return;
      }

      const effectiveRole = await resolveRole(
        req.user!.id, current.categoryId, cat?.knowledgeBaseId, req.user!.role as Role,
      );
      if (!hasMinimumRole(effectiveRole, 'editor')) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      if (req.body.categoryId !== undefined && req.body.categoryId !== current.categoryId) {
        const [destinationCategory] = await tx.select({ knowledgeBaseId: categories.knowledgeBaseId })
          .from(categories)
          .where(eq(categories.id, req.body.categoryId));

        if (!destinationCategory || (kbId && destinationCategory.knowledgeBaseId !== kbId)) {
          res.status(404).json({ error: 'Category not found' });
          return;
        }

        const destinationRole = await resolveRole(
          req.user!.id, req.body.categoryId, destinationCategory.knowledgeBaseId, req.user!.role as Role,
        );
        if (!hasMinimumRole(destinationRole, 'editor')) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }

      const nextTitle = req.body.title ?? current.title;
      const nextCategoryId = req.body.categoryId ?? current.categoryId;
      const nextContent = req.body.content ?? current.content;
      const isNoOp = nextTitle === current.title
        && nextCategoryId === current.categoryId
        && JSON.stringify(nextContent) === JSON.stringify(current.content);

      if (isNoOp) {
        result = current;
        return;
      }

      // 3. Compute next version number
      const [maxVersion] = await tx
        .select({ max: sql<number>`coalesce(max(version_number), 0)` })
        .from(articleVersions)
        .where(eq(articleVersions.articleId, id));
      const nextVersion = (maxVersion?.max ?? 0) + 1;

      // 4. Apply updates with optimistic concurrency on the row we authorized.
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body.title !== undefined) {
        updates.title = req.body.title;
        updates.slug = toSlug(req.body.title);
      }
      if (req.body.content !== undefined) updates.content = req.body.content;
      if (req.body.categoryId !== undefined) updates.categoryId = req.body.categoryId;

      // Update plain_text for full-text search
      const newContent = req.body.content ?? current.content;
      updates.plainText = extractText(newContent);

      let updated;
      try {
        [updated] = await tx.update(articles)
          .set(updates)
          .where(buildArticleCurrentStatePredicate(current))
          .returning();
      } catch (err: any) {
        if (isCategoryReferenceConflict(err) && req.body.categoryId !== undefined && req.body.categoryId !== current.categoryId) {
          throw new Error(ARTICLE_DESTINATION_NOT_FOUND);
        }

        if (err.code === '23505' && err.constraint_name?.includes('slug')) {
          updates.slug = `${updates.slug}-${Date.now().toString(36)}`;
          try {
            [updated] = await tx.update(articles)
              .set(updates)
              .where(buildArticleCurrentStatePredicate(current))
              .returning();
          } catch (retryErr: any) {
            if (isCategoryReferenceConflict(retryErr) && req.body.categoryId !== undefined && req.body.categoryId !== current.categoryId) {
              throw new Error(ARTICLE_DESTINATION_NOT_FOUND);
            }
            throw retryErr;
          }
        } else {
          throw err;
        }
      }

      if (!updated) {
        throw new Error(ARTICLE_UPDATE_CONFLICT);
      }

      // 5. Snapshot the previously-authorized state only after the update succeeds.
      await tx.insert(articleVersions).values({
        articleId: id,
        title: current.title,
        content: current.content,
        authorId: req.user!.id,
        versionNumber: nextVersion,
      });

      didChange = true;
      result = updated;
      const [updatedCategory] = await tx.select({ knowledgeBaseId: categories.knowledgeBaseId })
        .from(categories)
        .where(eq(categories.id, updated.categoryId));

      await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
        kind: 'article.edited',
        actorId: req.user!.id,
        knowledgeBaseId: updatedCategory?.knowledgeBaseId,
        subjectId: updated.id,
        subjectLabel: updated.title,
        metadata: { articleId: updated.id },
      }));
    });
  } catch (err: any) {
    if (err.message === ARTICLE_UPDATE_NOT_FOUND) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    if (err.message === ARTICLE_DESTINATION_NOT_FOUND) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    if (err.message === ARTICLE_UPDATE_CONFLICT) {
      res.status(409).json({ error: 'Article changed during update' });
      return;
    }
    throw err;
  }

  if (!res.headersSent) {
    if (didChange) {
      void generateEmbeddings(id).catch(err => console.error('Embedding generation failed:', err));
    }
    res.json(result);
  }
});

// DELETE /api/articles/:id — archive (soft delete)
articlesRouter.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const article = await loadScopedEditorArticle(req, res, id);
  if (!article) {
    return;
  }

  const [archived] = await db
    .update(articles)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(buildArticleCurrentStatePredicate(article))
    .returning();

  if (!archived) {
    res.status(409).json({ error: 'Article changed during archive' });
    return;
  }
  res.json(archived);
});

// POST /api/articles/:id/publish
articlesRouter.post('/:id/publish', authMiddleware, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const article = await loadScopedEditorArticle(req, res, id);
  if (!article) {
    return;
  }

  const [published] = await db
    .update(articles)
    .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
    .where(buildArticleCurrentStatePredicate(article))
    .returning();

  if (!published) {
    res.status(409).json({ error: 'Article changed during publish' });
    return;
  }
  res.json(published);
});
