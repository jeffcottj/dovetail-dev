import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { adminActivityEvents, db, importJobs, tags, userKbRoles } from '@dovetail/db';
import { authMiddleware } from '../../middleware/auth.js';
import { requireKbAdmin, type AuthKbRequest } from '../../middleware/resolveKb.js';
import { normalizeAdminActivityRow, type AdminActivityRow } from '../../services/admin-activity.js';

export const kbOverviewRouter: Router = Router({ mergeParams: true });

kbOverviewRouter.get('/', authMiddleware, requireKbAdmin, async (req: AuthKbRequest, res) => {
  const kbId = req.params.kbId as string;

  const [{ count: usersTotal }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userKbRoles)
    .where(eq(userKbRoles.knowledgeBaseId, kbId));
  const [{ count: tagsTotal }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tags)
    .where(eq(tags.knowledgeBaseId, kbId));
  const [{ count: importsTotal }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(importJobs)
    .where(eq(importJobs.knowledgeBaseId, kbId));
  const [{ count: articleActivityRecent }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminActivityEvents)
    .where(and(
      eq(adminActivityEvents.knowledgeBaseId, kbId),
      sql`${adminActivityEvents.kind} LIKE 'article.%'`,
    ));

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
    WHERE e.knowledge_base_id = ${kbId}
    ORDER BY e.created_at DESC
    LIMIT 20
  `);

  res.json({
    kb: req.kb,
    metrics: {
      users: {
        total: Number(usersTotal),
      },
      tags: {
        total: Number(tagsTotal),
      },
      imports: {
        total: Number(importsTotal),
      },
      articleActivity: {
        recent: Number(articleActivityRecent),
      },
    },
    activity: (activityRows as unknown as AdminActivityRow[]).map(normalizeAdminActivityRow),
  });
});
