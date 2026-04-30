import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { jsonResult, runWithErrorHandling, errorResult } from './types.js';

const RELATED_LIMIT_MAX = 20;
const RELATED_LIMIT_DEFAULT = 5;

const inputSchema = {
  articleId: z
    .string()
    .uuid()
    .optional()
    .describe('Find related articles to this article. Mutually exclusive with query.'),
  query: z
    .string()
    .min(1)
    .max(5000)
    .optional()
    .describe('Find articles related to this free-text query. Mutually exclusive with articleId.'),
  knowledgeBaseIds: z
    .array(z.string().uuid())
    .min(1)
    .optional()
    .describe('Optional list of allowed KB UUIDs to constrain results. Defaults to all KBs allowed by the API key.'),
  categoryIds: z.array(z.string().uuid()).optional().describe('Optional category UUID filter.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(RELATED_LIMIT_MAX)
    .optional()
    .describe(`Maximum article suggestions to return (default ${RELATED_LIMIT_DEFAULT}, max ${RELATED_LIMIT_MAX}).`),
} as const;

export const suggestRelatedArticlesTool: ToolDefinition<typeof inputSchema> = {
  name: 'suggest_related_articles',
  config: {
    title: 'Suggest Related Articles',
    description:
      'Suggests articles related to a seed article (articleId) or natural-language query (query). Exactly one of articleId or query is required. Results are article-level (not chunk-level) with the best matching snippet, score, KB metadata, and category path. Drafts and archived articles are excluded.',
    inputSchema,
  },
  handler: (args, { client }) =>
    runWithErrorHandling(async () => {
      const { articleId, query, knowledgeBaseIds, categoryIds, limit } = args as {
        articleId?: string;
        query?: string;
        knowledgeBaseIds?: string[];
        categoryIds?: string[];
        limit?: number;
      };

      if (Boolean(articleId) === Boolean(query)) {
        return errorResult('Provide exactly one of articleId or query.');
      }

      const resolvedLimit = Math.min(limit ?? RELATED_LIMIT_DEFAULT, RELATED_LIMIT_MAX);
      const results = await client.suggestRelatedArticles({
        articleId,
        query,
        knowledgeBaseIds,
        categoryIds,
        limit: resolvedLimit,
      });
      return jsonResult({ results });
    }),
};
