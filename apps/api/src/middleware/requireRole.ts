import type { NextFunction, Response } from 'express';
import type { Role } from '@dovetail/types';
import type { AuthRequest } from './auth.js';
import { hasMinimumRole } from '../services/permissions.js';

/**
 * Coarse-grained role gate based on the user's global role.
 * For per-category RBAC, call resolveRole() in the route handler itself
 * (after fetching the resource to know its categoryId).
 */
export function requireRole(minimum: Role) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role as Role | undefined;
    if (!userRole || !hasMinimumRole(userRole, minimum)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
