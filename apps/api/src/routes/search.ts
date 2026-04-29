import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { validateQuery } from '../utils/validate.js';
import { paginationSchema, paginate } from '../utils/pagination.js';
import { searchArticles } from '../services/search.js';
import type { Role } from '@dovetail/types';

export const searchRouter: Router = Router({ mergeParams: true });

const searchQuerySchema = paginationSchema.extend({
  q: z.string().min(1),
  mode: z.enum(['fulltext', 'semantic', 'hybrid']).default('fulltext'),
  categoryId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  tags: z.string().optional(),
  onlyEditable: z.enum(['true', 'false']).optional().transform((value) => value === 'true').default(false),
});

function tagIdsFromQuery(tags?: string) {
  return tags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [];
}

searchRouter.get('/', authMiddleware, validateQuery(searchQuerySchema), async (req: AuthRequest, res) => {
  const kbId = req.params.kbId as string;
  const query = res.locals.query as z.infer<typeof searchQuerySchema>;

  const result = await searchArticles({
    q: query.q,
    mode: query.mode,
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    knowledgeBaseIds: [kbId],
    categoryId: query.categoryId,
    tagIds: tagIdsFromQuery(query.tags),
    updatedFrom: query.from,
    updatedTo: query.to,
    onlyEditable: query.onlyEditable,
    page: query.page,
    limit: query.limit,
  });

  res.json(paginate(result.data, result.total, { page: query.page, limit: query.limit }));
});
