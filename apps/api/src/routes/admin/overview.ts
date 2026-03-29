import { Router } from 'express';
import { isNull, sql } from 'drizzle-orm';
import { apiKeys, db, knowledgeBases, users } from '@dovetail/db';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/requireRole.js';
import { normalizeAdminActivityRow, type AdminActivityRow } from '../../services/admin-activity.js';

export const overviewRouter: Router = Router();

overviewRouter.get('/', authMiddleware, requireRole('admin'), async (_req, res) => {
  const [{ count: usersTotal }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);
  const userRoles = await db
    .select({ role: users.role })
    .from(users);
  const [{ count: knowledgeBasesTotal }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(knowledgeBases);
  const [{ count: activeApiKeys }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apiKeys)
    .where(isNull(apiKeys.revokedAt));
  const [{ count: revokedApiKeys }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apiKeys)
    .where(sql`${apiKeys.revokedAt} IS NOT NULL`);

  const roleMix = {
    admin: 0,
    editor: 0,
    viewer: 0,
  };

  for (const row of userRoles) {
    if (row.role in roleMix) {
      roleMix[row.role as keyof typeof roleMix] += 1;
    }
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
    ORDER BY e.created_at DESC
    LIMIT 20
  `);

  res.json({
    metrics: {
      users: {
        total: Number(usersTotal),
        byRole: roleMix,
      },
      knowledgeBases: {
        total: Number(knowledgeBasesTotal),
      },
      apiKeys: {
        active: Number(activeApiKeys),
        revoked: Number(revokedApiKeys),
      },
    },
    activity: (activityRows as unknown as AdminActivityRow[]).map(normalizeAdminActivityRow),
  });
});
