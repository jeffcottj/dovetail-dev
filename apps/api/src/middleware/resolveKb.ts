import { type Request, type Response, type NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, knowledgeBases } from '@dovetail/db';
import type { KnowledgeBase, Role } from '@dovetail/types';
import { canViewKnowledgeBase, hasMinimumRole, resolveEffectiveKbRole } from '../services/permissions.js';

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
 * Middleware that requires the authenticated user to be able to see the current KB.
 * Must be used after both authMiddleware and resolveKb.
 */
export async function requireVisibleKb(req: AuthKbRequest, res: Response, next: NextFunction) {
  const userRole = req.user?.role as Role | undefined;
  if (!req.user?.id || !userRole) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const kbId = req.kb?.id;
  if (!kbId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if ((req.kb as KnowledgeBase & { defaultAccess?: string }).defaultAccess !== 'private') {
    next();
    return;
  }

  try {
    const visible = await canViewKnowledgeBase({
      userId: req.user.id,
      globalRole: userRole,
      knowledgeBaseId: kbId,
    });

    if (!visible) {
      res.status(404).json({ error: 'Knowledge base not found' });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware that requires the user to be a global admin OR a KB-level admin for the current KB.
 * Must be used after both authMiddleware and resolveKb.
 */
export async function requireKbAdmin(req: AuthKbRequest, res: Response, next: NextFunction) {
  const userRole = req.user?.role as Role | undefined;
  if (!req.user?.id || !userRole) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Global admins always pass
  if (hasMinimumRole(userRole, 'admin')) {
    next();
    return;
  }

  const kbId = req.kb?.id;
  if (!kbId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const effectiveRole = await resolveEffectiveKbRole({
      userId: req.user.id,
      globalRole: userRole,
      knowledgeBaseId: kbId,
    });

    if (effectiveRole === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}
