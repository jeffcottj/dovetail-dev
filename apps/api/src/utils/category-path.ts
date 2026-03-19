import { sql } from 'drizzle-orm';
import { db, categories } from '@dovetail/db';

/**
 * Resolve a category path like ["housing", "rental"] to the final category ID.
 * Walks top-down: finds root category with matching slug and NULL parent,
 * then each subsequent child.
 * Returns null if any segment doesn't match.
 */
export async function resolveCategoryPath(slugSegments: string[]): Promise<string | null> {
  if (slugSegments.length === 0) return null;

  let parentId: string | null = null;

  for (const slug of slugSegments) {
    const parentCondition = parentId
      ? sql`${categories.parentId} = ${parentId}`
      : sql`${categories.parentId} IS NULL`;

    const result = await db.execute(sql`
      SELECT ${categories.id}
      FROM ${categories}
      WHERE ${categories.slug} = ${slug}
        AND ${parentCondition}
      LIMIT 1
    `);

    if ((result as any[]).length === 0) return null;
    parentId = (result as any[])[0].id;
  }

  return parentId;
}

/**
 * Build the full category slug path from a given category ID.
 * Walks up the parent chain via recursive CTE.
 * Returns ordered array like ["housing", "rental"] (root first).
 */
export async function buildCategoryPath(categoryId: string): Promise<string[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, slug, parent_id, 0 AS depth
      FROM ${categories}
      WHERE id = ${categoryId}
      UNION ALL
      SELECT c.id, c.slug, c.parent_id, a.depth + 1
      FROM ${categories} c
      INNER JOIN ancestors a ON c.id = a.parent_id
    )
    SELECT slug, depth FROM ancestors
    ORDER BY depth DESC
  `);

  return (result as any[]).map((r) => r.slug);
}
