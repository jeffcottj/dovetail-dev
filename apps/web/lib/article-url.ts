import type { Article } from '@dovetail/types';

/**
 * Build the full URL path for an article using its categoryPath.
 * Falls back to slug-only if categoryPath is not available.
 */
export function articleUrl(article: Pick<Article, 'slug' | 'categoryPath'>): string {
  if (article.categoryPath && article.categoryPath.length > 0) {
    return `/articles/${article.categoryPath.join('/')}/${article.slug}`;
  }
  return `/articles/${article.slug}`;
}
