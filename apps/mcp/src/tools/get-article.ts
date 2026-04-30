import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { jsonResult, runWithErrorHandling, errorResult } from './types.js';

const inputSchema = {
  articleId: z.string().uuid().optional().describe('UUID of the article. Provide this OR knowledgeBaseSlug+path.'),
  knowledgeBaseSlug: z
    .string()
    .min(1)
    .optional()
    .describe('KB slug for path-based lookup. Combine with path. Mutually exclusive with articleId.'),
  knowledgeBaseId: z
    .string()
    .uuid()
    .optional()
    .describe('KB UUID for path-based lookup. Combine with path. Mutually exclusive with articleId.'),
  path: z
    .string()
    .min(1)
    .optional()
    .describe('Slash-separated category and article slug path, e.g. "tenant-rights/security-deposits".'),
} as const;

export const getArticleTool: ToolDefinition<typeof inputSchema> = {
  name: 'get_article',
  config: {
    title: 'Get Article',
    description:
      'Fetches full content and metadata for a single published article. Provide articleId OR (knowledgeBaseId|knowledgeBaseSlug)+path. Returns title, content (Tiptap JSON), plain text, KB and category path metadata, URL, and last edited info. Drafts, archived articles, and out-of-scope articles return not_found.',
    inputSchema,
  },
  handler: (args, { client }) =>
    runWithErrorHandling(async () => {
      const { articleId, knowledgeBaseId, knowledgeBaseSlug, path } = args as {
        articleId?: string;
        knowledgeBaseId?: string;
        knowledgeBaseSlug?: string;
        path?: string;
      };

      if (articleId && (knowledgeBaseId || knowledgeBaseSlug || path)) {
        return errorResult('Provide articleId OR a path lookup, not both.');
      }
      if (articleId) {
        const article = await client.getArticle(articleId);
        return jsonResult({ article });
      }

      if (!path) {
        return errorResult('Provide articleId, or path with knowledgeBaseId or knowledgeBaseSlug.');
      }
      if (Boolean(knowledgeBaseId) === Boolean(knowledgeBaseSlug)) {
        return errorResult('Provide exactly one of knowledgeBaseId or knowledgeBaseSlug for path lookup.');
      }

      const article = await client.getArticleByPath({ knowledgeBaseId, knowledgeBaseSlug, path });
      return jsonResult({ article });
    }),
};
