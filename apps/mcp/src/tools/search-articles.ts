import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { jsonResult, runWithErrorHandling } from './types.js';

const SEARCH_LIMIT_MAX = 20;
const SEARCH_LIMIT_DEFAULT = 5;

const inputSchema = {
  query: z.string().min(1).max(5000).describe('Natural language search query.'),
  knowledgeBaseIds: z
    .array(z.string().uuid())
    .min(1)
    .optional()
    .describe(
      'Optional list of knowledge base UUIDs to search. If omitted, all KBs allowed by the API key are searched. KBs outside scope cause an error.',
    ),
  categoryIds: z.array(z.string().uuid()).optional().describe('Optional category UUID filter.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_LIMIT_MAX)
    .optional()
    .describe(`Maximum chunks to return (default ${SEARCH_LIMIT_DEFAULT}, max ${SEARCH_LIMIT_MAX}).`),
} as const;

export const searchArticlesTool: ToolDefinition<typeof inputSchema> = {
  name: 'search_articles',
  config: {
    title: 'Search Articles',
    description:
      'Performs semantic search across published articles and attachments. Returns chunk-oriented results with article URL, KB metadata, category path, last edited metadata, source type (article or attachment), and similarity score. Drafts and archived articles are never returned. Use get_article for full content.',
    inputSchema,
  },
  handler: (args, { client }) =>
    runWithErrorHandling(async () => {
      const { query, knowledgeBaseIds, categoryIds, limit } = args as {
        query: string;
        knowledgeBaseIds?: string[];
        categoryIds?: string[];
        limit?: number;
      };

      const resolvedLimit = Math.min(limit ?? SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX);
      const ids = knowledgeBaseIds ?? (await client.listKnowledgeBases()).map((kb) => kb.id);
      if (ids.length === 0) {
        return jsonResult({ results: [] });
      }

      const results = await client.searchArticles({
        query,
        knowledgeBaseIds: ids,
        categoryIds,
        limit: resolvedLimit,
      });
      return jsonResult({ results });
    }),
};
