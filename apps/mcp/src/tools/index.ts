import type { ToolDefinition } from './types.js';
import { listKnowledgeBasesTool } from './list-knowledge-bases.js';
import { listCategoriesTool } from './list-categories.js';
import { searchArticlesTool } from './search-articles.js';
import { getArticleTool } from './get-article.js';
import { getArticleCitationsTool } from './get-article-citations.js';
import { suggestRelatedArticlesTool } from './suggest-related-articles.js';

export const tools: ToolDefinition<any>[] = [
  listKnowledgeBasesTool,
  listCategoriesTool,
  searchArticlesTool,
  getArticleTool,
  getArticleCitationsTool,
  suggestRelatedArticlesTool,
];

export {
  listKnowledgeBasesTool,
  listCategoriesTool,
  searchArticlesTool,
  getArticleTool,
  getArticleCitationsTool,
  suggestRelatedArticlesTool,
};
