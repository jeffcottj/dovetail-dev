import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@dovetail/db';
import { apiKeyAuth } from '../middleware/apiKeyAuth.js';
import type { ApiKeyRequest } from '../middleware/apiKeyAuth.js';
import { validateBody, validateQuery } from '../utils/validate.js';
import { createEmbeddingProvider } from '../services/embeddings.js';
import { buildCategoryPath, resolveCategoryPath } from '../utils/category-path.js';

export const ragRouter: Router = Router();

const uuidSchema = z.string().uuid();

const ragSearchSchema = z.object({
  query: z.string().min(1).max(5000),
  limit: z.number().int().min(1).max(50).default(5),
  knowledgeBaseIds: z.array(uuidSchema).min(1),
  categoryIds: z.array(uuidSchema).optional(),
});

const kbParamsSchema = z.object({
  kbId: uuidSchema,
});

const articleParamsSchema = z.object({
  articleId: uuidSchema,
});

const articleByPathQuerySchema = z.object({
  knowledgeBaseId: uuidSchema.optional(),
  knowledgeBaseSlug: z.string().min(1).optional(),
  path: z.string().min(1),
}).refine((value) => Boolean(value.knowledgeBaseId) !== Boolean(value.knowledgeBaseSlug), {
  message: 'Provide exactly one of knowledgeBaseId or knowledgeBaseSlug',
  path: ['knowledgeBaseId'],
});

const relatedArticlesSchema = z.object({
  articleId: uuidSchema.optional(),
  query: z.string().min(1).max(5000).optional(),
  knowledgeBaseIds: z.array(uuidSchema).min(1).optional(),
  categoryIds: z.array(uuidSchema).optional(),
  limit: z.number().int().min(1).max(20).default(5),
}).refine((value) => Boolean(value.articleId) !== Boolean(value.query), {
  message: 'Provide exactly one of articleId or query',
  path: ['articleId'],
});

function parseParams<T>(schema: z.ZodSchema<T>, value: unknown) {
  return schema.safeParse(value);
}

function getAllowedKbIds(req: ApiKeyRequest) {
  return req.allowedKbIds ?? [];
}

function isAllowedKb(req: ApiKeyRequest, knowledgeBaseId: string) {
  return getAllowedKbIds(req).includes(knowledgeBaseId);
}

function rejectInvalidParams(res: any, result: ReturnType<z.ZodSchema['safeParse']>) {
  if (!result.success) {
    res.status(400).json({ error: 'Validation error', details: result.error.issues });
    return true;
  }
  return false;
}

function rejectDisallowedKb(req: ApiKeyRequest, res: any, knowledgeBaseId: string) {
  if (!isAllowedKb(req, knowledgeBaseId)) {
    res.status(403).json({ error: 'API key does not have access to requested knowledge base' });
    return true;
  }
  return false;
}

function rejectDisallowedKbs(req: ApiKeyRequest, res: any, knowledgeBaseIds: string[]) {
  const unauthorized = knowledgeBaseIds.filter((id) => !isAllowedKb(req, id));
  if (unauthorized.length > 0) {
    res.status(403).json({ error: 'API key does not have access to requested knowledge base(s)' });
    return true;
  }
  return false;
}

function machineArticleUrl(kbSlug: string, categoryPath: string[], articleSlug: string) {
  return `/kb/${kbSlug}/articles/${[...categoryPath, articleSlug].join('/')}`;
}

async function categoryPathFor(categoryId: string) {
  return buildCategoryPath(categoryId);
}

function parseScore(value: unknown) {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeArticleRow(row: any, categoryPath: string[]) {
  return {
    id: row.article_id ?? row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    content: row.content,
    plainText: row.plain_text ?? row.plainText ?? null,
    categoryId: row.category_id ?? row.categoryId,
    categoryPath,
    articleUrl: machineArticleUrl(row.knowledge_base_slug, categoryPath, row.slug),
    knowledgeBase: {
      id: row.knowledge_base_id,
      name: row.knowledge_base_name,
      slug: row.knowledge_base_slug,
    },
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    lastEditedAt: row.updated_at,
    lastEditedBy: row.last_edited_by_id
      ? {
        id: row.last_edited_by_id,
        name: row.last_edited_by_name ?? null,
        email: row.last_edited_by_email ?? null,
      }
      : null,
  };
}

async function formatRagChunk(row: any) {
  const categoryPath = await categoryPathFor(row.category_id);
  return {
    articleId: row.article_id,
    articleTitle: row.title,
    articleUrl: machineArticleUrl(row.knowledge_base_slug, categoryPath, row.slug),
    knowledgeBase: {
      id: row.knowledge_base_id,
      name: row.knowledge_base_name,
      slug: row.knowledge_base_slug,
    },
    categoryId: row.category_id,
    categoryPath,
    lastEditedAt: row.updated_at,
    lastEditedById: row.last_edited_by_id,
    lastEditedByName: row.last_edited_by_name,
    lastEditedByEmail: row.last_edited_by_email,
    sourceType: row.source_type ?? 'article',
    chunkIndex: row.chunk_index,
    attachmentId: row.attachment_id ?? null,
    attachmentFilename: row.attachment_filename ?? null,
    chunkText: row.chunk_text,
    score: parseScore(row.similarity),
  };
}

async function loadPublishedArticleForApiKey(articleId: string, allowedKbIds: string[]) {
  if (allowedKbIds.length === 0) return null;

  const rows = await db.execute(sql`
    SELECT
      a.id AS article_id,
      a.title,
      a.slug,
      a.content,
      a.plain_text,
      a.status,
      a.category_id,
      a.author_id,
      a.created_at,
      a.updated_at,
      a.published_at,
      a.last_edited_by_id,
      u.name AS last_edited_by_name,
      u.email AS last_edited_by_email,
      kb.id AS knowledge_base_id,
      kb.name AS knowledge_base_name,
      kb.slug AS knowledge_base_slug
    FROM articles a
    INNER JOIN categories c ON c.id = a.category_id
    INNER JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
    LEFT JOIN users u ON u.id = a.last_edited_by_id
    WHERE a.id = ${articleId}
      AND a.status = 'published'
      AND kb.id = ANY(${allowedKbIds}::uuid[])
    LIMIT 1
  `) as any[];

  const row = rows[0];
  if (!row) return null;
  const categoryPath = await categoryPathFor(row.category_id);
  return normalizeArticleRow(row, categoryPath);
}

async function resolveAllowedKnowledgeBaseIdBySlug(req: ApiKeyRequest, slug: string) {
  const allowedKbIds = getAllowedKbIds(req);
  if (allowedKbIds.length === 0) return null;

  const rows = await db.execute(sql`
    SELECT id
    FROM knowledge_bases
    WHERE slug = ${slug}
      AND id = ANY(${allowedKbIds}::uuid[])
    LIMIT 1
  `) as Array<{ id: string }>;

  return rows[0]?.id ?? null;
}

async function runRagVectorSearch(args: {
  query: string;
  limit: number;
  knowledgeBaseIds: string[];
  categoryIds?: string[];
  excludeArticleId?: string;
}) {
  const provider = createEmbeddingProvider();
  const queryEmbedding = await provider.embed(args.query);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;
  const categoryFilter = args.categoryIds?.length
    ? sql`AND a.category_id = ANY(${args.categoryIds}::uuid[])`
    : sql``;
  const excludeFilter = args.excludeArticleId
    ? sql`AND a.id <> ${args.excludeArticleId}`
    : sql``;

  return db.execute(sql`
    SELECT *
    FROM (
      SELECT ae.article_id, ae.chunk_text, ae.chunk_index,
             1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity,
             ae.embedding <=> ${vectorLiteral}::vector AS distance,
             a.title, a.slug, a.category_id, a.updated_at,
             a.last_edited_by_id, u.name AS last_edited_by_name, u.email AS last_edited_by_email,
             kb.id AS knowledge_base_id, kb.name AS knowledge_base_name, kb.slug AS knowledge_base_slug,
             'article' AS source_type,
             NULL::uuid AS attachment_id,
             NULL::text AS attachment_filename
      FROM article_embeddings ae
      JOIN articles a ON a.id = ae.article_id
      JOIN categories c ON c.id = a.category_id
      JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      LEFT JOIN users u ON u.id = a.last_edited_by_id
      WHERE a.status = 'published'
        AND kb.id = ANY(${args.knowledgeBaseIds}::uuid[])
        ${categoryFilter}
        ${excludeFilter}
      UNION ALL
      SELECT a.id AS article_id, att_embed.chunk_text, att_embed.chunk_index,
             1 - (att_embed.embedding <=> ${vectorLiteral}::vector) AS similarity,
             att_embed.embedding <=> ${vectorLiteral}::vector AS distance,
             a.title, a.slug, a.category_id, a.updated_at,
             a.last_edited_by_id, u.name AS last_edited_by_name, u.email AS last_edited_by_email,
             kb.id AS knowledge_base_id, kb.name AS knowledge_base_name, kb.slug AS knowledge_base_slug,
             'attachment' AS source_type,
             att.id AS attachment_id,
             att.filename AS attachment_filename
      FROM attachment_embeddings att_embed
      JOIN attachments att ON att.id = att_embed.attachment_id
      JOIN articles a ON a.id = att.article_id
      JOIN categories c ON c.id = a.category_id
      JOIN knowledge_bases kb ON kb.id = c.knowledge_base_id
      LEFT JOIN users u ON u.id = a.last_edited_by_id
      WHERE a.status = 'published'
        AND kb.id = ANY(${args.knowledgeBaseIds}::uuid[])
        ${categoryFilter}
        ${excludeFilter}
    ) results
    ORDER BY distance ASC
    LIMIT ${args.limit}
  `) as Promise<any[]>;
}

ragRouter.get('/knowledge-bases', apiKeyAuth, async (req: ApiKeyRequest, res) => {
  const allowedKbIds = getAllowedKbIds(req);
  if (allowedKbIds.length === 0) {
    res.json([]);
    return;
  }

  const rows = await db.execute(sql`
    SELECT id, name, slug, description, created_at AS "createdAt"
    FROM knowledge_bases
    WHERE id = ANY(${allowedKbIds}::uuid[])
    ORDER BY name ASC
  `);

  res.json(rows);
});

ragRouter.get('/knowledge-bases/:kbId/categories', apiKeyAuth, async (req: ApiKeyRequest, res) => {
  const params = parseParams(kbParamsSchema, req.params);
  if (rejectInvalidParams(res, params)) return;

  const { kbId } = params.data!;
  if (rejectDisallowedKb(req, res, kbId)) return;

  const rows = await db.execute(sql`
    SELECT
      id,
      name,
      slug,
      parent_id AS "parentId",
      knowledge_base_id AS "knowledgeBaseId",
      created_at AS "createdAt"
    FROM categories
    WHERE knowledge_base_id = ${kbId}
    ORDER BY name ASC
  `) as any[];

  const categories = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      path: await categoryPathFor(row.id),
    })),
  );

  categories.sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')) || a.name.localeCompare(b.name));
  res.json(categories);
});

ragRouter.get('/articles/by-path', apiKeyAuth, validateQuery(articleByPathQuerySchema), async (req: ApiKeyRequest, res) => {
  const query = res.locals.query as z.infer<typeof articleByPathQuerySchema>;
  let knowledgeBaseId = query.knowledgeBaseId ?? null;

  if (knowledgeBaseId && rejectDisallowedKb(req, res, knowledgeBaseId)) return;

  if (query.knowledgeBaseSlug) {
    knowledgeBaseId = await resolveAllowedKnowledgeBaseIdBySlug(req, query.knowledgeBaseSlug);
    if (!knowledgeBaseId) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
  }

  const segments = query.path.split('/').filter(Boolean);
  if (segments.length < 2) {
    res.status(400).json({ error: 'Path must include at least a category and article slug' });
    return;
  }

  const articleSlug = segments[segments.length - 1];
  const categoryId = await resolveCategoryPath(segments.slice(0, -1), knowledgeBaseId ?? undefined);
  if (!categoryId) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  const rows = await db.execute(sql`
    SELECT a.id
    FROM articles a
    WHERE a.slug = ${articleSlug}
      AND a.category_id = ${categoryId}
      AND a.status = 'published'
    LIMIT 1
  `) as Array<{ id: string }>;

  const article = rows[0] ? await loadPublishedArticleForApiKey(rows[0].id, getAllowedKbIds(req)) : null;
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  res.json(article);
});

ragRouter.get('/articles/:articleId/citations', apiKeyAuth, async (req: ApiKeyRequest, res) => {
  const params = parseParams(articleParamsSchema, req.params);
  if (rejectInvalidParams(res, params)) return;

  const article = await loadPublishedArticleForApiKey(params.data!.articleId, getAllowedKbIds(req));
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  const chunks = await db.execute(sql`
    SELECT *
    FROM (
      SELECT
        'article' AS "sourceType",
        ae.chunk_index AS "chunkIndex",
        ae.chunk_text AS "chunkText",
        NULL::uuid AS "attachmentId",
        NULL::text AS "attachmentFilename"
      FROM article_embeddings ae
      WHERE ae.article_id = ${article.id}
      UNION ALL
      SELECT
        'attachment' AS "sourceType",
        att_embed.chunk_index AS "chunkIndex",
        att_embed.chunk_text AS "chunkText",
        att.id AS "attachmentId",
        att.filename AS "attachmentFilename"
      FROM attachment_embeddings att_embed
      INNER JOIN attachments att ON att.id = att_embed.attachment_id
      WHERE att.article_id = ${article.id}
    ) citation_chunks
    ORDER BY "sourceType" ASC, "attachmentFilename" ASC NULLS FIRST, "chunkIndex" ASC
  `);

  res.json({
    article: {
      id: article.id,
      title: article.title,
      url: article.articleUrl,
      knowledgeBase: article.knowledgeBase,
      categoryPath: article.categoryPath,
      lastEditedAt: article.lastEditedAt,
      lastEditedBy: article.lastEditedBy,
    },
    chunks,
  });
});

ragRouter.get('/articles/:articleId', apiKeyAuth, async (req: ApiKeyRequest, res) => {
  const params = parseParams(articleParamsSchema, req.params);
  if (rejectInvalidParams(res, params)) return;

  const article = await loadPublishedArticleForApiKey(params.data!.articleId, getAllowedKbIds(req));
  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  res.json(article);
});

ragRouter.post('/related-articles', apiKeyAuth, validateBody(relatedArticlesSchema), async (req: ApiKeyRequest, res) => {
  const body = req.body as z.infer<typeof relatedArticlesSchema>;
  const allowedKbIds = getAllowedKbIds(req);
  const knowledgeBaseIds = body.knowledgeBaseIds ?? allowedKbIds;
  if (rejectDisallowedKbs(req, res, knowledgeBaseIds)) return;

  if (knowledgeBaseIds.length === 0) {
    res.json({ results: [] });
    return;
  }

  let query = body.query;
  let excludeArticleId: string | undefined;
  if (body.articleId) {
    const article = await loadPublishedArticleForApiKey(body.articleId, allowedKbIds);
    if (!article) {
      res.status(404).json({ error: 'Article not found' });
      return;
    }
    query = [article.title, article.plainText].filter(Boolean).join('\n');
    excludeArticleId = article.id;
  }

  const rows = await runRagVectorSearch({
    query: query!,
    limit: body.limit * 4,
    knowledgeBaseIds,
    categoryIds: body.categoryIds,
    excludeArticleId,
  });

  const formatted = await Promise.all(rows.map(formatRagChunk));
  const seen = new Set<string>();
  const results = [];
  for (const result of formatted) {
    if (seen.has(result.articleId)) continue;
    seen.add(result.articleId);
    results.push({
      articleId: result.articleId,
      articleTitle: result.articleTitle,
      articleUrl: result.articleUrl,
      knowledgeBase: result.knowledgeBase,
      categoryId: result.categoryId,
      categoryPath: result.categoryPath,
      lastEditedAt: result.lastEditedAt,
      lastEditedById: result.lastEditedById,
      lastEditedByName: result.lastEditedByName,
      lastEditedByEmail: result.lastEditedByEmail,
      sourceType: result.sourceType,
      attachmentId: result.attachmentId,
      attachmentFilename: result.attachmentFilename,
      snippet: result.chunkText,
      score: result.score,
    });
    if (results.length >= body.limit) break;
  }

  res.json({ results });
});

ragRouter.post('/search', apiKeyAuth, validateBody(ragSearchSchema), async (req: ApiKeyRequest, res) => {
  const { query, limit, knowledgeBaseIds, categoryIds } = req.body as z.infer<typeof ragSearchSchema>;

  if (rejectDisallowedKbs(req, res, knowledgeBaseIds)) return;

  const results = await runRagVectorSearch({
    query,
    limit,
    knowledgeBaseIds,
    categoryIds,
  });

  res.json({ results: await Promise.all(results.map(formatRagChunk)) });
});
