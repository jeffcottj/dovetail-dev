import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@dovetail/db';
import { authMiddleware } from '../middleware/auth.js';
import { normalizeAdminActivityRow, type AdminActivityRow } from '../services/admin-activity.js';

export const workspaceRouter: Router = Router();

workspaceRouter.get('/activity', authMiddleware, async (_req, res) => {
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
    ORDER BY e.created_at DESC
    LIMIT 20
  `);

  const articleActivityRows = (activityRows as unknown as AdminActivityRow[]).filter(
    (row) => row.kind === 'article.created' || row.kind === 'article.edited',
  );

  res.json(articleActivityRows.map(normalizeAdminActivityRow));
});
