import { db } from '@dovetail/db';
import { sql } from 'drizzle-orm';
import type { Role } from '@dovetail/types';

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

/**
 * Resolve the effective role for a user in the context of a category.
 * Walks up the category ancestor chain via recursive CTE.
 * Most-specific (deepest) category role wins; falls back to global role.
 */
export async function resolveRole(
  userId: string,
  categoryId: string,
  globalRole: Role,
): Promise<Role> {
  const result = await db.execute(sql`
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

  if (result.length > 0) {
    return result[0].role as Role;
  }

  return globalRole;
}

export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
