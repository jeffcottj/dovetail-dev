import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { adminActivityEvents, db, users, userCategoryRoles, categories } from '@dovetail/db';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { buildAdminActivityInsert } from '../../services/admin-activity.js';
import { validateBody, validateQuery } from '../../utils/validate.js';
import { paginationSchema, paginate } from '../../utils/pagination.js';

export const adminUsersRouter: Router = Router();

const updateRoleSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin']),
});

const assignCategoryRoleSchema = z.object({
  categoryId: z.string().uuid(),
  role: z.enum(['viewer', 'editor', 'admin']),
});

// GET /api/admin/users — list users (paginated)
adminUsersRouter.get('/', authMiddleware, requireRole('admin'), validateQuery(paginationSchema), async (_req, res) => {
  const { page, limit } = res.locals.query as z.infer<typeof paginationSchema>;
  const offset = (page - 1) * limit;

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);

  const data = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
      provider: users.provider,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)
    .limit(limit)
    .offset(offset);

  res.json(paginate(data, Number(total), { page, limit }));
});

// PATCH /api/admin/users/:id — update global role
adminUsersRouter.patch('/:id', authMiddleware, requireRole('admin'), validateBody(updateRoleSchema), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { role } = req.body;
  let updated;
  let outcome: 'updated' | 'not_found' | 'conflict' = 'not_found';

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(users)
      .where(eq(users.id, id));

    if (!current) {
      outcome = 'not_found';
      return;
    }

    if (current.role === role) {
      updated = current;
      outcome = 'updated';
      return;
    }

    [updated] = await tx
      .update(users)
      .set({ role })
      .where(and(eq(users.id, id), eq(users.role, current.role)))
      .returning();

    if (!updated) {
      outcome = 'conflict';
      return;
    }

    await tx.insert(adminActivityEvents).values(buildAdminActivityInsert({
      kind: 'user.role_changed',
      actorId: req.user!.id,
      subjectId: updated.id,
      subjectLabel: updated.name,
      metadata: { previousRole: current.role, newRole: updated.role },
    }));

    outcome = 'updated';
  });

  if (outcome === 'not_found') {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (outcome === 'conflict') {
    res.status(409).json({ error: 'User role changed concurrently' });
    return;
  }

  res.json(updated);
});

// GET /api/admin/users/:id/category-roles — list category role overrides
adminUsersRouter.get('/:id/category-roles', authMiddleware, requireRole('admin'), async (req, res) => {
  const userId = req.params.id as string;

  const categoryRoles = await db
    .select({
      categoryId: userCategoryRoles.categoryId,
      categoryName: categories.name,
      role: userCategoryRoles.role,
    })
    .from(userCategoryRoles)
    .innerJoin(categories, eq(userCategoryRoles.categoryId, categories.id))
    .where(eq(userCategoryRoles.userId, userId));

  res.json({ categoryRoles });
});

// POST /api/admin/users/:id/category-roles — assign category role
adminUsersRouter.post('/:id/category-roles', authMiddleware, requireRole('admin'), validateBody(assignCategoryRoleSchema), async (req, res) => {
  const userId = req.params.id as string;
  const { categoryId, role } = req.body;

  const [created] = await db
    .insert(userCategoryRoles)
    .values({ userId, categoryId, role })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    // Conflict — update existing
    const [updated] = await db
      .update(userCategoryRoles)
      .set({ role })
      .where(and(eq(userCategoryRoles.userId, userId), eq(userCategoryRoles.categoryId, categoryId)))
      .returning();
    res.status(200).json(updated);
    return;
  }

  res.status(201).json(created);
});

// DELETE /api/admin/users/:id/category-roles/:categoryId — remove category role
adminUsersRouter.delete('/:id/category-roles/:categoryId', authMiddleware, requireRole('admin'), async (req, res) => {
  const userId = req.params.id as string;
  const categoryId = req.params.categoryId as string;

  await db
    .delete(userCategoryRoles)
    .where(and(eq(userCategoryRoles.userId, userId), eq(userCategoryRoles.categoryId, categoryId)));

  res.status(204).end();
});

// GET /api/admin/users/:id — fetch one user
adminUsersRouter.get('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const id = req.params.id as string;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      role: users.role,
      provider: users.provider,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
});
