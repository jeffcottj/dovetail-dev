import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { listVisibleKnowledgeBaseIds } from '../services/permissions.js';
import { validateQuery } from '../utils/validate.js';
import { paginationSchema, paginate } from '../utils/pagination.js';
import { normalizeAdminActivityRow, type AdminActivityRow } from '../services/admin-activity.js';
import { listSearchOptions, listStaleContent, searchArticles } from '../services/search.js';
import type { Role } from '@dovetail/types';

export const workspaceRouter: Router = Router();

const workspaceSearchSchema = paginationSchema.extend({
  q: z.string().min(1),
  mode: z.enum(['fulltext', 'semantic', 'hybrid']).default('fulltext'),
  knowledgeBaseIds: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  tags: z.string().optional(),
  onlyEditable: z.enum(['true', 'false']).optional().transform((value) => value === 'true').default(false),
});

const workspaceSearchOptionsSchema = z.object({
  knowledgeBaseIds: z.string().optional(),
});

const staleContentSchema = paginationSchema.extend({
  knowledgeBaseIds: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  updatedBefore: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

function visibleKbSql(ids: string[]) {
  return sql.join(ids.map((id) => sql`${id}`), sql`,`);
}

function idsFromQuery(value?: string) {
  return value?.split(',').map((id) => id.trim()).filter(Boolean) ?? [];
}

function tagIdsFromQuery(value?: string) {
  return idsFromQuery(value);
}

async function resolveWorkspaceKbScope(args: {
  userId: string;
  globalRole: Role;
  requestedIds?: string;
}) {
  const visibleKbIds = await listVisibleKnowledgeBaseIds({
    userId: args.userId,
    globalRole: args.globalRole,
  });
  const requested = idsFromQuery(args.requestedIds);
  if (requested.length === 0) {
    return visibleKbIds;
  }

  const visible = new Set(visibleKbIds);
  return requested.filter((id) => visible.has(id));
}

workspaceRouter.get('/activity', authMiddleware, async (req: AuthRequest, res) => {
  const visibleKbIds = await listVisibleKnowledgeBaseIds({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
  });
  if (visibleKbIds.length === 0) {
    res.json([]);
    return;
  }

  const activityRows = await db.execute(sql`
    SELECT
      e.id,
      e.kind,
      e.created_at AS "createdAt",
      e.actor_id AS "actorId",
      u.name AS "actorName",
      u.email AS "actorEmail",
      e.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      e.subject_id AS "subjectId",
      e.subject_label AS "subjectLabel",
      e.metadata
    FROM admin_activity_events e
    INNER JOIN users u ON u.id = e.actor_id
    LEFT JOIN knowledge_bases kb ON kb.id = e.knowledge_base_id
    WHERE e.kind IN ('article.created', 'article.edited')
      AND e.knowledge_base_id IN (${visibleKbSql(visibleKbIds)})
    ORDER BY e.created_at DESC
    LIMIT 20
  `);

  const articleActivityRows = (activityRows as unknown as AdminActivityRow[]).filter(
    (row) => row.kind === 'article.created' || row.kind === 'article.edited',
  );

  res.json(articleActivityRows.map(normalizeAdminActivityRow));
});

workspaceRouter.get('/search', authMiddleware, validateQuery(workspaceSearchSchema), async (req: AuthRequest, res) => {
  const query = res.locals.query as z.infer<typeof workspaceSearchSchema>;
  const knowledgeBaseIds = await resolveWorkspaceKbScope({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    requestedIds: query.knowledgeBaseIds,
  });

  const result = await searchArticles({
    q: query.q,
    mode: query.mode,
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    knowledgeBaseIds,
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

workspaceRouter.get('/search/options', authMiddleware, validateQuery(workspaceSearchOptionsSchema), async (req: AuthRequest, res) => {
  const query = res.locals.query as z.infer<typeof workspaceSearchOptionsSchema>;
  const knowledgeBaseIds = await resolveWorkspaceKbScope({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    requestedIds: query.knowledgeBaseIds,
  });

  res.json(await listSearchOptions({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    knowledgeBaseIds,
  }));
});

workspaceRouter.get('/maintenance/stale', authMiddleware, validateQuery(staleContentSchema), async (req: AuthRequest, res) => {
  const query = res.locals.query as z.infer<typeof staleContentSchema>;
  const knowledgeBaseIds = await resolveWorkspaceKbScope({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    requestedIds: query.knowledgeBaseIds,
  });

  const result = await listStaleContent({
    userId: req.user!.id,
    globalRole: req.user!.role as Role,
    knowledgeBaseIds,
    categoryId: query.categoryId,
    updatedBefore: query.updatedBefore,
    createdBefore: query.createdBefore,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });

  res.json(paginate(result.data, result.total, { page: query.page, limit: query.limit }));
});
