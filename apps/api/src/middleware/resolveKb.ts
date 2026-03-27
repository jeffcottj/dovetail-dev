import { type Request, type Response, type NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db, knowledgeBases } from '@dovetail/db';
import type { KnowledgeBase, Role } from '@dovetail/types';
import { hasMinimumRole } from '../services/permissions.js';

export interface KbRequest extends Request {
  kb?: KnowledgeBase;
}

export async function resolveKb(req: KbRequest, res: Response, next: NextFunction) {
  const kbId = req.params.kbId as string;
  if (!kbId) {
    res.status(400).json({ error: 'Missing knowledge base ID' });
    return;
  }

  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  if (!kb) {
    res.status(404).json({ error: 'Knowledge base not found' });
    return;
  }

  req.kb = kb;
  next();
}

export interface AuthKbRequest extends KbRequest {
  user?: { id: string; role: string };
}

/**
 * Middleware that requires the user to be a global admin OR a KB-level admin for the current KB.
 * Must be used after both authMiddleware and resolveKb.
 */
export function requireKbAdmin(req: AuthKbRequest, res: Response, next: NextFunction) {
  const userRole = req.user?.role as Role | undefined;
  if (!userRole) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Global admins always pass
  if (hasMinimumRole(userRole, 'admin')) {
    next();
    return;
  }

  // Check KB-level admin role
  const kbId = req.kb?.id;
  if (!kbId || !req.user?.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  db.execute(sql`
    SELECT role FROM user_kb_roles
    WHERE user_id = ${req.user.id} AND knowledge_base_id = ${kbId}
    LIMIT 1
  `).then((result) => {
    if (result.length > 0 && result[0].role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  }).catch(() => {
    res.status(500).json({ error: 'Internal server error' });
  });
}
