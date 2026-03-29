import type { Article } from '@dovetail/types';

/**
 * Build the full URL path for an article within a knowledge base.
 * Falls back to slug-only if categoryPath is not available.
 */
export function articleUrl(article: Pick<Article, 'slug' | 'categoryPath' | 'knowledgeBaseSlug'>, kbSlug?: string): string {
  const kb = kbSlug ?? article.knowledgeBaseSlug ?? 'default';
  if (article.categoryPath && article.categoryPath.length > 0) {
    return `/kb/${kb}/articles/${article.categoryPath.join('/')}/${article.slug}`;
  }
  return `/kb/${kb}/articles/${article.slug}`;
}
