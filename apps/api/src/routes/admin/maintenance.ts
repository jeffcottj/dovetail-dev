import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../../middleware/auth.js';
import { validateQuery } from '../../utils/validate.js';
import { paginationSchema, paginate } from '../../utils/pagination.js';
import { listStaleContent } from '../../services/search.js';
import type { Role } from '@dovetail/types';

export const maintenanceRouter: Router = Router({ mergeParams: true });

const staleContentSchema = paginationSchema.extend({
  categoryId: z.string().uuid().optional(),
  updatedBefore: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

maintenanceRouter.get('/stale', authMiddleware, validateQuery(staleContentSchema), async (req: AuthRequest, res) => {
  const query = res.locals.query as z.infer<typeof staleContentSchema>;
  const kbId = req.params.kbId as string;

  const result = await listStaleContent({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    knowledgeBaseIds: [kbId],
    categoryId: query.categoryId,
    updatedBefore: query.updatedBefore,
    createdBefore: query.createdBefore,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });

  res.json(paginate(result.data, result.total, { page: query.page, limit: query.limit }));
});
