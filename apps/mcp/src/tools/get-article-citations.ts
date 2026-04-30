import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { jsonResult, runWithErrorHandling } from './types.js';

const inputSchema = {
  articleId: z.string().uuid().describe('UUID of a published article in an allowed KB.'),
} as const;

export const getArticleCitationsTool: ToolDefinition<typeof inputSchema> = {
  name: 'get_article_citations',
  config: {
    title: 'Get Article Citations',
    description:
      'Returns citation-ready chunks for one published article, covering both article body chunks and attachment chunks. Each chunk includes source type, chunk index, chunk text, and attachment metadata when applicable. Use after search_articles or alongside get_article when constructing source references.',
    inputSchema,
  },
  handler: (args, { client }) =>
    runWithErrorHandling(async () => {
      const { articleId } = args as { articleId: string };
      const citations = await client.getArticleCitations(articleId);
      return jsonResult(citations);
    }),
};
