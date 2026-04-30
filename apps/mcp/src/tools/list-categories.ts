import { z } from 'zod';
import type { ToolDefinition } from './types.js';
import { jsonResult, runWithErrorHandling } from './types.js';

const inputSchema = {
  knowledgeBaseId: z
    .string()
    .uuid()
    .describe('UUID of a knowledge base returned by list_knowledge_bases.'),
} as const;

export const listCategoriesTool: ToolDefinition<typeof inputSchema> = {
  name: 'list_categories',
  config: {
    title: 'List Categories',
    description:
      'Lists categories within one knowledge base the API key can access. Each category includes a path array of slug segments to support citations and category-based filtering. Returns 403/forbidden if the KB is outside scope.',
    inputSchema,
  },
  handler: (args, { client }) =>
    runWithErrorHandling(async () => {
      const { knowledgeBaseId } = args as { knowledgeBaseId: string };
      const categories = await client.listCategories(knowledgeBaseId);
      return jsonResult({ knowledgeBaseId, categories });
    }),
};
