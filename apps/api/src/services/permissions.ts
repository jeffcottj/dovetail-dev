import { db } from '@dovetail/db';
import { sql } from 'drizzle-orm';
import type { ArticleStatus, KnowledgeBase, Role } from '@dovetail/types';

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

export type EffectiveRole = Role | null;

export function hasMinimumRole(userRole: EffectiveRole, requiredRole: Role): boolean {
  return userRole !== null && ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function isGlobalAdmin(globalRole: Role): boolean {
  return hasMinimumRole(globalRole, 'admin');
}

export async function resolveEffectiveKbRole(args: {
  userId: string;
  globalRole: Role;
  knowledgeBaseId: string;
}): Promise<EffectiveRole> {
  const { userId, globalRole, knowledgeBaseId } = args;

  if (isGlobalAdmin(globalRole)) {
    return 'admin';
  }

  const rows = await db.execute(sql`
    SELECT
      kb.default_access AS "defaultAccess",
      ukr.role AS "kbRole"
    FROM knowledge_bases kb
    LEFT JOIN user_kb_roles ukr
      ON ukr.knowledge_base_id = kb.id
     AND ukr.user_id = ${userId}
    WHERE kb.id = ${knowledgeBaseId}
    LIMIT 1
  `) as Array<{ defaultAccess: 'org_viewer' | 'private'; kbRole: Role | null }>;

  const row = rows[0];
  if (!row) {
    return null;
  }

  if (row.kbRole) {
    return row.kbRole;
  }

  return row.defaultAccess === 'org_viewer' ? globalRole : null;
}

export async function resolveEffectiveCategoryRole(args: {
  userId: string;
  globalRole: Role;
  categoryId: string;
  knowledgeBaseId?: string;
}): Promise<EffectiveRole> {
  const { userId, globalRole, categoryId } = args;

  if (isGlobalAdmin(globalRole)) {
    return 'admin';
  }

  const categoryResult = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, knowledge_base_id, 0 AS depth
      FROM categories
      WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c.parent_id, c.knowledge_base_id, a.depth + 1
      FROM categories c
      INNER JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT ucr.role, a.knowledge_base_id AS "knowledgeBaseId"
    FROM ancestors a
    INNER JOIN user_category_roles ucr
      ON ucr.category_id = a.id AND ucr.user_id = ${userId}
    ORDER BY a.depth ASC
    LIMIT 1
  `) as Array<{ role: Role; knowledgeBaseId: string }>;

  if (categoryResult.length > 0) {
    return categoryResult[0].role;
  }

  const knowledgeBaseId = args.knowledgeBaseId ?? await getCategoryKnowledgeBaseId(categoryId);
  if (!knowledgeBaseId) {
    return null;
  }

  return resolveEffectiveKbRole({ userId, globalRole, knowledgeBaseId });
}

export async function canViewKnowledgeBase(args: {
  userId: string;
  globalRole: Role;
  knowledgeBaseId: string;
}): Promise<boolean> {
  const role = await resolveEffectiveKbRole(args);
  if (role) {
    return true;
  }

  const categoryRoleRows = await db.execute(sql`
    SELECT 1
    FROM user_category_roles ucr
    INNER JOIN categories c ON c.id = ucr.category_id
    WHERE ucr.user_id = ${args.userId}
      AND c.knowledge_base_id = ${args.knowledgeBaseId}
    LIMIT 1
  `);

  return categoryRoleRows.length > 0;
}

export async function canReadArticle(args: {
  userId: string;
  globalRole: Role;
  categoryId: string;
  knowledgeBaseId: string;
  status: ArticleStatus;
}): Promise<boolean> {
  if (args.status === 'published') {
    return canViewKnowledgeBase(args);
  }

  const role = await resolveEffectiveCategoryRole(args);
  return hasMinimumRole(role, 'editor');
}

export async function canEditArticle(args: {
  userId: string;
  globalRole: Role;
  categoryId: string;
  knowledgeBaseId?: string;
}): Promise<boolean> {
  const role = await resolveEffectiveCategoryRole(args);
  return hasMinimumRole(role, 'editor');
}

export async function canManageCategory(args: {
  userId: string;
  globalRole: Role;
  categoryId?: string;
  knowledgeBaseId: string;
  requiredRole?: Role;
}): Promise<boolean> {
  const requiredRole = args.requiredRole ?? 'editor';
  const role = args.categoryId
    ? await resolveEffectiveCategoryRole(args as {
      userId: string;
      globalRole: Role;
      categoryId: string;
      knowledgeBaseId: string;
    })
    : await resolveEffectiveKbRole(args);

  return hasMinimumRole(role, requiredRole);
}

export async function canManageKnowledgeBaseContent(args: {
  userId: string;
  globalRole: Role;
  knowledgeBaseId: string;
  requiredRole?: Role;
}): Promise<boolean> {
  const requiredRole = args.requiredRole ?? 'editor';
  const role = await resolveEffectiveKbRole(args);
  return hasMinimumRole(role, requiredRole);
}

export async function listVisibleKnowledgeBaseIds(args: {
  userId: string;
  globalRole: Role;
}): Promise<string[]> {
  const rows = await listVisibleKnowledgeBases(args);
  return rows.map((kb) => kb.id);
}

export async function getEditableCategoryIds(args: {
  userId: string;
  globalRole: Role;
  knowledgeBaseId: string;
}): Promise<string[]> {
  const kbRole = await resolveEffectiveKbRole(args);
  if (hasMinimumRole(kbRole, 'editor')) {
    const rows = await db.execute(sql`
      SELECT id
      FROM categories
      WHERE knowledge_base_id = ${args.knowledgeBaseId}
    `) as Array<{ id: string }>;

    return rows.map((row) => row.id);
  }

  const rows = await db.execute(sql`
    WITH RECURSIVE managed AS (
      SELECT c.id, c.parent_id
      FROM categories c
      INNER JOIN user_category_roles ucr
        ON ucr.category_id = c.id
       AND ucr.user_id = ${args.userId}
      WHERE c.knowledge_base_id = ${args.knowledgeBaseId}
        AND ucr.role IN ('editor', 'admin')
      UNION ALL
      SELECT child.id, child.parent_id
      FROM categories child
      INNER JOIN managed parent ON child.parent_id = parent.id
    )
    SELECT DISTINCT id
    FROM managed
  `) as Array<{ id: string }>;

  return rows.map((row) => row.id);
}

export async function listVisibleKnowledgeBases(args: {
  userId: string;
  globalRole: Role;
}): Promise<KnowledgeBase[]> {
  if (isGlobalAdmin(args.globalRole)) {
    const rows = await db.execute(sql`
      SELECT
        id,
        name,
        slug,
        description,
        default_access AS "defaultAccess",
        created_at AS "createdAt"
      FROM knowledge_bases
      ORDER BY name ASC
    `);
    return rows as unknown as KnowledgeBase[];
  }

  const rows = await db.execute(sql`
    SELECT DISTINCT
      kb.id,
      kb.name,
      kb.slug,
      kb.description,
      kb.default_access AS "defaultAccess",
      kb.created_at AS "createdAt"
    FROM knowledge_bases kb
    LEFT JOIN user_kb_roles ukr
      ON ukr.knowledge_base_id = kb.id
     AND ukr.user_id = ${args.userId}
    LEFT JOIN categories c
      ON c.knowledge_base_id = kb.id
    LEFT JOIN user_category_roles ucr
      ON ucr.category_id = c.id
     AND ucr.user_id = ${args.userId}
    WHERE kb.default_access = 'org_viewer'
       OR ukr.user_id IS NOT NULL
       OR ucr.user_id IS NOT NULL
    ORDER BY kb.name ASC
  `);
  return rows as unknown as KnowledgeBase[];
}

async function getCategoryKnowledgeBaseId(categoryId: string): Promise<string | null> {
  const rows = await db.execute(sql`
    SELECT knowledge_base_id AS "knowledgeBaseId"
    FROM categories
    WHERE id = ${categoryId}
    LIMIT 1
  `) as Array<{ knowledgeBaseId: string }>;

  return rows[0]?.knowledgeBaseId ?? null;
}

/**
 * Resolve the effective role for a user in a given context.
 * Three-tier cascade: category role → KB role → global role.
 * Most-specific wins.
 *
 * Legacy compatibility helper. New KB visibility code should use
 * resolveEffectiveKbRole() or resolveEffectiveCategoryRole().
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
