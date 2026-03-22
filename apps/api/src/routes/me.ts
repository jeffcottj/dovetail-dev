import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validateQuery } from '../utils/validate.js';
import { resolveRole } from '../services/permissions.js';
import type { Role } from '@dovetail/types';

export const meRouter: Router = Router();

const effectiveRoleQuery = z.object({
  categoryId: z.string().uuid(),
});

meRouter.get('/effective-role', authMiddleware, validateQuery(effectiveRoleQuery), async (req: AuthRequest, res) => {
  const { categoryId } = res.locals.query as z.infer<typeof effectiveRoleQuery>;
  const role = await resolveRole(req.user!.id, categoryId, req.user!.role as Role);
  res.json({ role });
});
