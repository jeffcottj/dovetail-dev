import type { ToolDefinition } from './types.js';
import { jsonResult, runWithErrorHandling } from './types.js';

export const listKnowledgeBasesTool: ToolDefinition<undefined> = {
  name: 'list_knowledge_bases',
  config: {
    title: 'List Knowledge Bases',
    description:
      'Lists Dovetail knowledge bases the configured API key has access to. Returns id, name, slug, and description for each KB. Use this before tools that take knowledgeBaseId or knowledgeBaseIds to discover valid scope.',
  },
  handler: (_args, { client }) =>
    runWithErrorHandling(async () => {
      const knowledgeBases = await client.listKnowledgeBases();
      return jsonResult({ knowledgeBases });
    }),
};
