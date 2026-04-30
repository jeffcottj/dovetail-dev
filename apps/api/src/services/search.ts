import { sql } from 'drizzle-orm';
import { db } from '@dovetail/db';
import type { ArticleStatus, Role, StaleContentResult, WorkspaceSearchResult } from '@dovetail/types';
import { createEmbeddingProvider } from './embeddings.js';
import { getEditableCategoryIds, isGlobalAdmin } from './permissions.js';
import { buildCategoryPath } from '../utils/category-path.js';

export type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

export interface ArticleSearchParams {
  q: string;
  mode: SearchMode;
  userId: string;
  globalRole: Role;
  knowledgeBaseIds: string[];
  categoryId?: string;
  tagIds?: string[];
  updatedFrom?: string;
  updatedTo?: string;
  onlyEditable?: boolean;
  page: number;
  limit: number;
}

export interface SearchOptionsParams {
  userId: string;
  globalRole: Role;
  knowledgeBaseIds: string[];
}

export interface StaleContentParams {
  userId: string;
  globalRole: Role;
  knowledgeBaseIds: string[];
  categoryId?: string;
  updatedBefore?: string;
  createdBefore?: string;
  status?: ArticleStatus;
  page: number;
  limit: number;
}

function idListSql(ids: string[]) {
  return sql.join(ids.map((id) => sql`${id}`), sql`,`);
}

function parseTotal(value: string | number | bigint | null | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return Number(value ?? 0);
}

function normalizeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeSearchRow(row: any) {
  return {
    ...row,
    id: row.id ?? row.article_id,
    categoryId: row.categoryId ?? row.category_id,
    knowledgeBaseId: row.knowledgeBaseId ?? row.knowledge_base_id,
    knowledgeBaseName: row.knowledgeBaseName ?? row.knowledge_base_name,
    knowledgeBaseSlug: row.knowledgeBaseSlug ?? row.knowledge_base_slug,
    authorId: row.authorId ?? row.author_id,
    lastEditedById: row.lastEditedById ?? row.last_edited_by_id,
    lastEditedByName: row.lastEditedByName ?? row.last_edited_by_name,
    lastEditedByEmail: row.lastEditedByEmail ?? row.last_edited_by_email,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
    chunkText: row.chunkText ?? row.chunk_text,
    staleSince: row.staleSince ?? row.stale_since,
    sourceType: row.sourceType ?? row.source_type ?? 'article',
    attachmentId: row.attachmentId ?? row.attachment_id ?? null,
    attachmentFilename: row.attachmentFilename ?? row.attachment_filename ?? null,
    attachmentMimeType: row.attachmentMimeType ?? row.attachment_mime_type ?? null,
  };
}

async function enrichRows<T>(rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map(async (raw) => {
      const row = normalizeSearchRow(raw);
      return {
        ...row,
        createdAt: normalizeDate(row.createdAt),
        updatedAt: normalizeDate(row.updatedAt),
        categoryPath: await buildCategoryPath(row.categoryId),
      } as T;
    }),
  );
}

async function editableCategoryIdsForScope(args: {
  userId: string;
  globalRole: Role;
  knowledgeBaseIds: string[];
}): Promise<string[] | null> {
  if (isGlobalAdmin(args.globalRole)) {
    return null;
  }

  const ids = await Promise.all(
    args.knowledgeBaseIds.map((knowledgeBaseId) =>
      getEditableCategoryIds({
        userId: args.userId,
        globalRole: args.globalRole,
        knowledgeBaseId,
      }),
    ),
  );

  return [...new Set(ids.flat())];
}

async function buildSqlFilters(params: {
  userId: string;
  globalRole: Role;
  knowledgeBaseIds: string[];
  categoryId?: string;
  tagIds?: string[];
  updatedFrom?: string;
  updatedTo?: string;
  onlyEditable?: boolean;
  requireEditable?: boolean;
  status?: ArticleStatus;
  updatedBefore?: string;
  createdBefore?: string;
}) {
  if (params.knowledgeBaseIds.length === 0) {
    return null;
  }

  const filters = [
    sql`kb.id IN (${idListSql(params.knowledgeBaseIds)})`,
  ];

  if (params.status) {
    filters.push(sql`a.status = ${params.status}`);
  } else {
    filters.push(sql`a.status = 'published'`);
  }

  if (params.categoryId) {
    filters.push(sql`a.category_id = ${params.categoryId}`);
  }

  if (params.updatedFrom) {
    filters.push(sql`a.updated_at >= ${new Date(params.updatedFrom)}`);
  }

  if (params.updatedTo) {
    filters.push(sql`a.updated_at <= ${new Date(params.updatedTo)}`);
  }

  if (params.updatedBefore) {
    filters.push(sql`a.updated_at <= ${new Date(params.updatedBefore)}`);
  }

  if (params.createdBefore) {
    filters.push(sql`a.created_at <= ${new Date(params.createdBefore)}`);
  }

  if (params.tagIds && params.tagIds.length > 0) {
    filters.push(sql`a.id IN (
      SELECT at.article_id
      FROM article_tags at
      WHERE at.tag_id IN (${idListSql(params.tagIds)})
    )`);
  }

  if (params.onlyEditable || params.requireEditable) {
    const editableCategoryIds = await editableCategoryIdsForScope(params);
    if (editableCategoryIds && editableCategoryIds.length === 0) {
      return null;
    }
    if (editableCategoryIds) {
      filters.push(sql`a.category_id IN (${idListSql(editableCategoryIds)})`);
    }
  }

  return sql.join(filters, sql` AND `);
}

async function fulltextSearch(params: ArticleSearchParams): Promise<{ data: WorkspaceSearchResult[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const filters = await buildSqlFilters(params);
  if (!filters) return { data: [], total: 0 };

  const whereClause = sql`${filters} AND a.search_vector @@ websearch_to_tsquery('english', ${params.q})`;
  const attachmentWhereClause = sql`${filters} AND att.search_vector @@ websearch_to_tsquery('english', ${params.q})`;

  const [{ count = 0 } = { count: 0 }] = (await db.execute(sql`
    SELECT count(*) AS count
    FROM (
      SELECT a.id AS source_id
      FROM articles a
      INNER JOIN categories c ON c.id = a.category_id
      INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      WHERE ${whereClause}
      UNION ALL
      SELECT att.id AS source_id
      FROM attachments att
      INNER JOIN articles a ON a.id = att.article_id
      INNER JOIN categories c ON c.id = a.category_id
      INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      WHERE ${attachmentWhereClause}
    ) source_rows
  `)) as unknown as Array<{ count: string | number }>;

  const rows = (await db.execute(sql`
    SELECT *
    FROM (
      SELECT
      a.id,
      a.title,
      a.slug,
      a.category_id AS "categoryId",
      c.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      kb.slug AS "knowledgeBaseSlug",
      a.author_id AS "authorId",
      a.last_edited_by_id AS "lastEditedById",
      u.name AS "lastEditedByName",
      u.email AS "lastEditedByEmail",
      a.status,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      ts_rank(a.search_vector, websearch_to_tsquery('english', ${params.q})) AS rank,
      ts_headline('english', COALESCE(a.plain_text, ''), websearch_to_tsquery('english', ${params.q}), 'MaxWords=32, MinWords=8, ShortWord=3') AS snippet,
      'article' AS "sourceType",
      NULL::uuid AS "attachmentId",
      NULL::text AS "attachmentFilename",
      NULL::text AS "attachmentMimeType"
      FROM articles a
      INNER JOIN categories c ON c.id = a.category_id
      INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      LEFT JOIN users u ON u.id = a.last_edited_by_id
      WHERE ${whereClause}
      UNION ALL
      SELECT
      a.id,
      a.title,
      a.slug,
      a.category_id AS "categoryId",
      c.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      kb.slug AS "knowledgeBaseSlug",
      a.author_id AS "authorId",
      a.last_edited_by_id AS "lastEditedById",
      u.name AS "lastEditedByName",
      u.email AS "lastEditedByEmail",
      a.status,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      ts_rank(att.search_vector, websearch_to_tsquery('english', ${params.q})) AS rank,
      ts_headline('english', COALESCE(att.extracted_text, ''), websearch_to_tsquery('english', ${params.q}), 'MaxWords=32, MinWords=8, ShortWord=3') AS snippet,
      'attachment' AS "sourceType",
      att.id AS "attachmentId",
      att.filename AS "attachmentFilename",
      att.mime_type AS "attachmentMimeType"
      FROM attachments att
      INNER JOIN articles a ON a.id = att.article_id
      INNER JOIN categories c ON c.id = a.category_id
      INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      LEFT JOIN users u ON u.id = a.last_edited_by_id
      WHERE ${attachmentWhereClause}
    ) results
    ORDER BY rank DESC, "sourceType" ASC, "updatedAt" DESC
    LIMIT ${params.limit}
    OFFSET ${offset}
  `)) as unknown as WorkspaceSearchResult[];

  return {
    data: await enrichRows(rows),
    total: parseTotal(count),
  };
}

async function semanticSearch(params: ArticleSearchParams): Promise<WorkspaceSearchResult[]> {
  const filters = await buildSqlFilters(params);
  if (!filters) return [];

  const provider = createEmbeddingProvider();
  const queryEmbedding = await provider.embed(params.q);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const rows = (await db.execute(sql`
    SELECT *
    FROM (
      SELECT
      a.id,
      a.title,
      a.slug,
      a.category_id AS "categoryId",
      c.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      kb.slug AS "knowledgeBaseSlug",
      a.author_id AS "authorId",
      a.last_edited_by_id AS "lastEditedById",
      u.name AS "lastEditedByName",
      u.email AS "lastEditedByEmail",
      a.status,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      ae.chunk_text AS "chunkText",
      ae.chunk_text AS snippet,
      1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
      ae.embedding <=> ${vectorLiteral}::vector AS distance,
      'article' AS "sourceType",
      NULL::uuid AS "attachmentId",
      NULL::text AS "attachmentFilename",
      NULL::text AS "attachmentMimeType"
      FROM article_embeddings ae
      INNER JOIN articles a ON a.id = ae.article_id
      INNER JOIN categories c ON c.id = a.category_id
      INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      LEFT JOIN users u ON u.id = a.last_edited_by_id
      WHERE ${filters}
      UNION ALL
      SELECT
      a.id,
      a.title,
      a.slug,
      a.category_id AS "categoryId",
      c.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      kb.slug AS "knowledgeBaseSlug",
      a.author_id AS "authorId",
      a.last_edited_by_id AS "lastEditedById",
      u.name AS "lastEditedByName",
      u.email AS "lastEditedByEmail",
      a.status,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      att_embed.chunk_text AS "chunkText",
      att_embed.chunk_text AS snippet,
      1 - (att_embed.embedding <=> ${vectorLiteral}::vector) AS similarity,
      att_embed.embedding <=> ${vectorLiteral}::vector AS distance,
      'attachment' AS "sourceType",
      att.id AS "attachmentId",
      att.filename AS "attachmentFilename",
      att.mime_type AS "attachmentMimeType"
      FROM attachment_embeddings att_embed
      INNER JOIN attachments att ON att.id = att_embed.attachment_id
      INNER JOIN articles a ON a.id = att.article_id
      INNER JOIN categories c ON c.id = a.category_id
      INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      LEFT JOIN users u ON u.id = a.last_edited_by_id
      WHERE ${filters}
    ) results
    ORDER BY distance ASC
    LIMIT ${params.limit}
  `)) as unknown as WorkspaceSearchResult[];

  return enrichRows(rows);
}

function reciprocalRankFusion(
  fulltextResults: WorkspaceSearchResult[],
  semanticResults: WorkspaceSearchResult[],
  k = 60,
): string[] {
  const scores = new Map<string, number>();
  const sourceKey = (result: WorkspaceSearchResult) =>
    result.sourceType === 'attachment' && result.attachmentId
      ? `attachment:${result.attachmentId}:${result.chunkText ?? result.snippet ?? ''}`
      : `article:${result.id}`;

  fulltextResults.forEach((r, rank) => {
    const key = sourceKey(r);
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1));
  });
  semanticResults.forEach((r, rank) => {
    const key = sourceKey(r);
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

export async function searchArticles(params: ArticleSearchParams): Promise<{ data: WorkspaceSearchResult[]; total: number }> {
  if (params.mode === 'fulltext') {
    return fulltextSearch(params);
  }

  if (params.mode === 'semantic') {
    const data = await semanticSearch(params);
    return { data, total: data.length };
  }

  const [fulltextResult, semanticResults] = await Promise.all([
    fulltextSearch(params),
    semanticSearch(params),
  ]);
  const rankedIds = reciprocalRankFusion(fulltextResult.data, semanticResults);
  const resultMap = new Map<string, WorkspaceSearchResult>();
  const sourceKey = (result: WorkspaceSearchResult) =>
    result.sourceType === 'attachment' && result.attachmentId
      ? `attachment:${result.attachmentId}:${result.chunkText ?? result.snippet ?? ''}`
      : `article:${result.id}`;

  for (const result of fulltextResult.data) {
    resultMap.set(sourceKey(result), result);
  }
  for (const result of semanticResults) {
    const key = sourceKey(result);
    if (!resultMap.has(key)) {
      resultMap.set(key, result);
    }
  }

  const data = rankedIds.map((id) => resultMap.get(id)).filter((result): result is WorkspaceSearchResult => Boolean(result));
  return { data, total: data.length };
}

export async function listSearchOptions(params: SearchOptionsParams) {
  if (params.knowledgeBaseIds.length === 0) {
    return { categories: [], tags: [] };
  }

  const kbFilter = sql`kb.id IN (${idListSql(params.knowledgeBaseIds)})`;

  const [categories, tags] = await Promise.all([
    db.execute(sql`
      SELECT
        c.id,
        c.name,
        c.slug,
        c.parent_id AS "parentId",
        c.knowledge_base_id AS "knowledgeBaseId",
        c.created_at AS "createdAt",
        kb.name AS "knowledgeBaseName"
      FROM categories c
      INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      WHERE ${kbFilter}
      ORDER BY kb.name ASC, c.name ASC
    `),
    db.execute(sql`
      SELECT
        t.id,
        t.name,
        t.slug,
        t.knowledge_base_id AS "knowledgeBaseId",
        kb.name AS "knowledgeBaseName"
      FROM tags t
      INNER JOIN knowledge_bases kb ON kb.id = t.knowledge_base_id
      WHERE ${kbFilter}
      ORDER BY kb.name ASC, t.name ASC
    `),
  ]);

  return { categories, tags };
}

export async function listStaleContent(params: StaleContentParams): Promise<{ data: StaleContentResult[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const filters = await buildSqlFilters({
    ...params,
    requireEditable: true,
  });
  if (!filters) return { data: [], total: 0 };

  const [{ count = 0 } = { count: 0 }] = (await db.execute(sql`
    SELECT count(DISTINCT a.id) AS count
    FROM articles a
    INNER JOIN categories c ON c.id = a.category_id
    INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
    WHERE ${filters}
  `)) as unknown as Array<{ count: string | number }>;

  const rows = (await db.execute(sql`
    SELECT
      a.id,
      a.title,
      a.slug,
      a.category_id AS "categoryId",
      c.knowledge_base_id AS "knowledgeBaseId",
      kb.name AS "knowledgeBaseName",
      kb.slug AS "knowledgeBaseSlug",
      a.author_id AS "authorId",
      a.last_edited_by_id AS "lastEditedById",
      u.name AS "lastEditedByName",
      u.email AS "lastEditedByEmail",
      a.status,
      a.created_at AS "createdAt",
      a.updated_at AS "updatedAt",
      CASE WHEN a.updated_at = a.created_at THEN a.created_at ELSE a.updated_at END AS "staleSince"
    FROM articles a
    INNER JOIN categories c ON c.id = a.category_id
    INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
    LEFT JOIN users u ON u.id = a.last_edited_by_id
    WHERE ${filters}
    ORDER BY "staleSince" ASC, a.title ASC
    LIMIT ${params.limit}
    OFFSET ${offset}
  `)) as unknown as StaleContentResult[];

  const data = await Promise.all(
    rows.map(async (raw) => {
      const row = normalizeSearchRow(raw);
      return {
      ...row,
      createdAt: normalizeDate(row.createdAt),
      updatedAt: normalizeDate(row.updatedAt),
      staleSince: normalizeDate(row.staleSince),
      categoryPath: await buildCategoryPath(row.categoryId),
      };
    }),
  );

  return {
    data,
    total: parseTotal(count),
  };
}
