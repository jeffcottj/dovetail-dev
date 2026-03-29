import { db } from '@dovetail/db';
import { sql } from 'drizzle-orm';
import type { Role } from '@dovetail/types';

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/**
 * Resolve the effective role for a user in a given context.
 * Three-tier cascade: category role → KB role → global role.
 * Most-specific wins.
 */
export async function resolveRole(
  userId: string,
  categoryId: string,
  knowledgeBaseId: string | undefined,
  globalRole: Role,
): Promise<Role> {
  // 1. Check category-level roles (walk ancestor chain)
  const categoryResult = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, 0 AS depth
      FROM categories
      WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c.parent_id, a.depth + 1
      FROM categories c
      INNER JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT ucr.role
    FROM ancestors a
    INNER JOIN user_category_roles ucr
      ON ucr.category_id = a.id AND ucr.user_id = ${userId}
    ORDER BY a.depth ASC
    LIMIT 1
  `);

  if (categoryResult.length > 0) {
    return categoryResult[0].role as Role;
  }

  // 2. Check KB-level role (if knowledgeBaseId provided)
  if (knowledgeBaseId) {
    const kbResult = await db.execute(sql`
      SELECT role FROM user_kb_roles
      WHERE user_id = ${userId} AND knowledge_base_id = ${knowledgeBaseId}
      LIMIT 1
    `);

    if (kbResult.length > 0) {
      return kbResult[0].role as Role;
    }
  }

  // 3. Fall back to global role
  return globalRole;
}

export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
