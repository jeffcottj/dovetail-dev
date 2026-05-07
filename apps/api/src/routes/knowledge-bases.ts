import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { adminActivityEvents, articles, attachments, db, knowledgeBases, categories, importJobs, tags, userKbRoles } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { resolveKb, requireKbAdmin } from '../middleware/resolveKb.js';
import { buildAdminActivityInsert } from '../services/admin-activity.js';
import { canViewKnowledgeBase, listVisibleKnowledgeBases } from '../services/permissions.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';
import type { KbDefaultAccess, Role } from '@dovetail/types';

export const knowledgeBasesRouter: Router = Router();
const KNOWLEDGE_BASE_DELETE_CONFLICT = 'KNOWLEDGE_BASE_DELETE_CONFLICT';
const KNOWLEDGE_BASE_DELETE_NOT_FOUND = 'KNOWLEDGE_BASE_DELETE_NOT_FOUND';

const kbDefaultAccessSchema = z.enum(['org_viewer', 'private']);

const createKbSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  defaultAccess: kbDefaultAccessSchema.default('org_viewer'),
});

const updateKbSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  defaultAccess: kbDefaultAccessSchema.optional(),
});

async function resolveKbFromId(req: AuthRequest, res: Parameters<typeof resolveKb>[1], next: Parameters<typeof resolveKb>[2]) {
  req.params.kbId = req.params.id as string;
  return resolveKb(req, res, next);
}

// GET /api/knowledge-bases — list KBs visible to the current user
knowledgeBasesRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const result = await listVisibleKnowledgeBases({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
  });
  res.json(result);
});

// POST /api/knowledge-bases — create KB (global admin only)
knowledgeBasesRouter.post(
  '/',
  authMiddleware,
  requireRole('admin'),
  validateBody(createKbSchema),
  async (req: AuthRequest, res) => {
    const { name, description, defaultAccess } = req.body as {
      name: string;
      description?: string;
      defaultAccess: KbDefaultAccess;
    };
    const slug = toSlug(name);
    try {
      const created = await db.transaction(async (tx) => {
        const [created] = await tx.insert(knowledgeBases).values({ name, slug, description: description ?? null, defaultAccess }).returning();
        if (!created) {
          throw new Error('Knowledge base creation failed');
        }
        await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
          kind: 'kb.created',
          actorId: req.user!.id,
          knowledgeBaseId: created.id,
          subjectId: created.id,
          subjectLabel: created.name,
          metadata: { defaultAccess },
        }));
        return created;
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name?.includes('slug')) {
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
        const created = await db.transaction(async (tx) => {
          const [created] = await tx.insert(knowledgeBases).values({ name, slug: uniqueSlug, description: description ?? null, defaultAccess }).returning();
          if (!created) {
            throw new Error('Knowledge base creation failed');
          }
          await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
            kind: 'kb.created',
            actorId: req.user!.id,
            knowledgeBaseId: created.id,
            subjectId: created.id,
            subjectLabel: created.name,
            metadata: { defaultAccess },
          }));
          return created;
        });
        res.status(201).json(created);
      } else {
        throw err;
      }
    }
  },
);

// GET /api/knowledge-bases/:id — single KB
knowledgeBasesRouter.get('/:id', authMiddleware, async (req, res) => {
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, req.params.id as string));
  if (!kb) {
    res.status(404).json({ error: 'Knowledge base not found' });
    return;
  }

  const visible = await canViewKnowledgeBase({
    userId: (req as AuthRequest).user!.id,
    globalRole: (req as AuthRequest).user!.role as Role,
    knowledgeBaseId: kb.id,
  });
  if (!visible) {
    res.status(404).json({ error: 'Knowledge base not found' });
    return;
  }

  res.json(kb);
});

// PATCH /api/knowledge-bases/:id — update KB (global admin or KB admin)
knowledgeBasesRouter.patch(
  '/:id',
  authMiddleware,
  resolveKbFromId,
  requireKbAdmin,
  validateBody(updateKbSchema),
  async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const previousKb = (req as AuthRequest & { kb?: { name: string; defaultAccess?: KbDefaultAccess } }).kb;
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) {
      updates.name = req.body.name;
      updates.slug = toSlug(req.body.name);
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description;
    }
    if (req.body.defaultAccess !== undefined) {
      updates.defaultAccess = req.body.defaultAccess;
    }

    if (Object.keys(updates).length === 0) {
      res.json(previousKb);
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [updated] = await tx.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, id)).returning();
      if (!updated) return null;

      if (
        req.body.defaultAccess !== undefined
        && previousKb?.defaultAccess !== undefined
        && req.body.defaultAccess !== previousKb.defaultAccess
      ) {
        await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
          kind: 'kb.access_changed',
          actorId: req.user!.id,
          knowledgeBaseId: id,
          subjectId: id,
          subjectLabel: previousKb.name,
          metadata: {
            from: previousKb.defaultAccess,
            to: req.body.defaultAccess,
          },
        }));
      }

      return updated;
    });

    if (!updated) {
      res.status(404).json({ error: 'Knowledge base not found' });
      return;
    }
    res.json(updated);
  },
);

// DELETE /api/knowledge-bases/:id — delete KB (global admin only).
// Pass ?purge=true to cascade-delete all KB contents (categories, articles,
// attachments, tags, import history) before removing the KB itself.
knowledgeBasesRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const purge = req.query.purge === 'true';
  let hasDependents = false;
  let notFound = false;

  try {
    await db.transaction(async (tx) => {
      const [kb] = await tx.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
      if (!kb) {
        notFound = true;
        return;
      }

      if (purge) {
        const categoryIdRows = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.knowledgeBaseId, id));
        const categoryIds = categoryIdRows.map((row) => row.id);

        const articleIdRows = categoryIds.length > 0
          ? await tx
              .select({ id: articles.id })
              .from(articles)
              .where(inArray(articles.categoryId, categoryIds))
          : [];
        const articleIds = articleIdRows.map((row) => row.id);

        const [tagCountRow] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(tags)
          .where(eq(tags.knowledgeBaseId, id));
        const [importJobCountRow] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(importJobs)
          .where(eq(importJobs.knowledgeBaseId, id));

        if (articleIds.length > 0) {
          // attachments use ON DELETE SET NULL; delete explicitly so they don't orphan
          await tx.delete(attachments).where(inArray(attachments.articleId, articleIds));
          // articles cascade to versions, article_tags, embeddings
          await tx.delete(articles).where(inArray(articles.id, articleIds));
        }
        if (categoryIds.length > 0) {
          await tx.delete(categories).where(inArray(categories.id, categoryIds));
        }
        await tx.delete(tags).where(eq(tags.knowledgeBaseId, id));
        await tx.delete(importJobs).where(eq(importJobs.knowledgeBaseId, id));

        await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
          kind: 'kb.deleted',
          actorId: req.user!.id,
          knowledgeBaseId: id,
          subjectId: id,
          subjectLabel: kb.name,
          metadata: {
            purged: true,
            articles: articleIds.length,
            categories: categoryIds.length,
            tags: Number(tagCountRow.count),
            importJobs: Number(importJobCountRow.count),
          },
        }));

        await tx.delete(knowledgeBases).where(eq(knowledgeBases.id, id));
        return;
      }

      const [catCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(categories)
        .where(eq(categories.knowledgeBaseId, id));

      if (Number(catCount.count) > 0) {
        hasDependents = true;
        return;
      }

      const [tagCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(tags)
        .where(eq(tags.knowledgeBaseId, id));

      if (Number(tagCount.count) > 0) {
        hasDependents = true;
        return;
      }

      const [activeImportJobCount] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(importJobs)
        .where(and(
          eq(importJobs.knowledgeBaseId, id),
          inArray(importJobs.status, ['pending', 'running']),
        ));

      if (Number(activeImportJobCount.count) > 0) {
        hasDependents = true;
        return;
      }

      await tx.delete(importJobs).where(and(
        eq(importJobs.knowledgeBaseId, id),
        inArray(importJobs.status, ['completed', 'failed']),
      ));

      try {
        await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
          kind: 'kb.deleted',
          actorId: req.user!.id,
          knowledgeBaseId: id,
          subjectId: id,
          subjectLabel: kb.name,
        }));
      } catch (err: any) {
        if (err?.code === '23503') {
          throw new Error(KNOWLEDGE_BASE_DELETE_NOT_FOUND);
        }
        throw err;
      }

      try {
        await tx.delete(knowledgeBases).where(eq(knowledgeBases.id, id));
      } catch (err: any) {
        if (err?.code === '23503') {
          throw new Error(KNOWLEDGE_BASE_DELETE_CONFLICT);
        }
        throw err;
      }
    });
  } catch (err: any) {
    if (err.message === KNOWLEDGE_BASE_DELETE_NOT_FOUND) {
      res.status(404).json({ error: 'Knowledge base not found' });
      return;
    }
    if (err.message === KNOWLEDGE_BASE_DELETE_CONFLICT) {
      res.status(409).json({ error: 'Cannot delete knowledge base with dependent records. Remove categories, tags, and active import jobs first.' });
      return;
    }
    throw err;
  }

  if (notFound) {
    res.status(404).json({ error: 'Knowledge base not found' });
    return;
  }

  if (hasDependents) {
    res.status(409).json({ error: 'Cannot delete knowledge base with dependent records. Remove categories, tags, and active import jobs first.' });
    return;
  }

  res.status(204).end();
});

// --- KB User Role Management ---

const setKbRoleSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin']),
});

// GET /api/knowledge-bases/:kbId/users — list users with KB roles (global admin or KB admin)
knowledgeBasesRouter.get('/:kbId/users', authMiddleware, resolveKb, requireKbAdmin, async (req, res) => {
  const kbId = req.params.kbId as string;

  const result = await db.execute(sql`
    SELECT u.id AS "userId", u.email, u.name, u.avatar_url AS "avatarUrl",
           u.role AS "globalRole", ukr.role AS "kbRole"
    FROM users u
    LEFT JOIN user_kb_roles ukr ON ukr.user_id = u.id AND ukr.knowledge_base_id = ${kbId}
    ORDER BY u.name ASC
  `);

  res.json(result);
});

// POST /api/knowledge-bases/:kbId/users/:userId — set KB role (global admin or KB admin)
knowledgeBasesRouter.post(
  '/:kbId/users/:userId',
  authMiddleware,
  resolveKb,
  requireKbAdmin,
  validateBody(setKbRoleSchema),
  async (req, res) => {
    const { kbId, userId } = req.params as { kbId: string; userId: string };
    const { role } = req.body;

    const [result] = await db
      .insert(userKbRoles)
      .values({ userId, knowledgeBaseId: kbId, role })
      .onConflictDoUpdate({
        target: [userKbRoles.userId, userKbRoles.knowledgeBaseId],
        set: { role },
      })
      .returning();

    res.json(result);
  },
);

// DELETE /api/knowledge-bases/:kbId/users/:userId — remove KB role (global admin or KB admin)
knowledgeBasesRouter.delete('/:kbId/users/:userId', authMiddleware, resolveKb, requireKbAdmin, async (req, res) => {
  const { kbId, userId } = req.params as { kbId: string; userId: string };

  await db.delete(userKbRoles).where(
    sql`${userKbRoles.userId} = ${userId} AND ${userKbRoles.knowledgeBaseId} = ${kbId}`,
  );

  res.status(204).end();
});
