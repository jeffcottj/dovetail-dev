import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { adminActivityEvents, db, knowledgeBases, categories, userKbRoles } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { resolveKb, requireKbAdmin } from '../middleware/resolveKb.js';
import { buildAdminActivityInsert } from '../services/admin-activity.js';
import { validateBody } from '../utils/validate.js';
import { toSlug } from '../utils/slug.js';

export const knowledgeBasesRouter: Router = Router();

const createKbSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

const updateKbSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

// GET /api/knowledge-bases — list all KBs
knowledgeBasesRouter.get('/', authMiddleware, async (_req, res) => {
  const result = await db.select().from(knowledgeBases);
  res.json(result);
});

// POST /api/knowledge-bases — create KB (global admin only)
knowledgeBasesRouter.post(
  '/',
  authMiddleware,
  requireRole('admin'),
  validateBody(createKbSchema),
  async (req: AuthRequest, res) => {
    const { name, description } = req.body;
    const slug = toSlug(name);
    try {
      const [created] = await db.insert(knowledgeBases).values({ name, slug, description: description ?? null }).returning();
      await db.insert(adminActivityEvents).values(buildAdminActivityInsert({
        kind: 'kb.created',
        actorId: req.user!.id,
        knowledgeBaseId: created.id,
        subjectId: created.id,
        subjectLabel: created.name,
      }));
      res.status(201).json(created);
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name?.includes('slug')) {
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`;
        const [created] = await db.insert(knowledgeBases).values({ name, slug: uniqueSlug, description: description ?? null }).returning();
        await db.insert(adminActivityEvents).values(buildAdminActivityInsert({
          kind: 'kb.created',
          actorId: req.user!.id,
          knowledgeBaseId: created.id,
          subjectId: created.id,
          subjectLabel: created.name,
        }));
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
  res.json(kb);
});

// PATCH /api/knowledge-bases/:id — update KB (global admin only for now)
knowledgeBasesRouter.patch(
  '/:id',
  authMiddleware,
  requireRole('admin'),
  validateBody(updateKbSchema),
  async (req, res) => {
    const id = req.params.id as string;
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) {
      updates.name = req.body.name;
      updates.slug = toSlug(req.body.name);
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description;
    }

    const [updated] = await db.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: 'Knowledge base not found' });
      return;
    }
    res.json(updated);
  },
);

// DELETE /api/knowledge-bases/:id — delete KB (global admin only, fails if has categories)
knowledgeBasesRouter.delete('/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));

  const [catCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.knowledgeBaseId, id));

  if (Number(catCount.count) > 0) {
    res.status(409).json({ error: 'Cannot delete knowledge base with categories. Remove all categories first.' });
    return;
  }

  await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id));

  if (kb) {
    await db.insert(adminActivityEvents).values(buildAdminActivityInsert({
      kind: 'kb.deleted',
      actorId: req.user!.id,
      knowledgeBaseId: id,
      subjectId: id,
      subjectLabel: kb.name,
    }));
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
