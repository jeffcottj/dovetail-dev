const FLOWLU_ARTICLE_MODULE_PATTERN = /\/_module\/knowledgebase\/view\/article\/([^/?#]+)/i;
const ARTICLE_PATH_PATTERN = /(?:^|\/)articles\/([^/?#]+)\/?$/i;

function hrefPathWithoutQueryOrHash(href: string): { path: string; hash: string } {
  const hashIndex = href.indexOf('#');
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  return {
    path: queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex),
    hash,
  };
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function flowluSourceIdFromArticleCode(code: string): string | null {
  const decoded = decodePathSegment(code).replace(/\/+$/, '');
  if (!decoded.includes('--')) {
    return null;
  }

  const [prefix] = decoded.split('--');
  const parts = prefix.split('-').filter(Boolean);
  const sourceId = parts[parts.length - 1];
  return sourceId && /^\d+$/.test(sourceId) ? sourceId : null;
}

export function flowluSourceIdFromHref(href: string): { sourceId: string; hash: string } | null {
  const { path, hash } = hrefPathWithoutQueryOrHash(href.trim());

  const moduleMatch = path.match(FLOWLU_ARTICLE_MODULE_PATTERN);
  if (moduleMatch?.[1]) {
    const sourceId = flowluSourceIdFromArticleCode(moduleMatch[1]);
    return sourceId ? { sourceId, hash } : null;
  }

  const articlePathMatch = path.match(ARTICLE_PATH_PATTERN);
  if (articlePathMatch?.[1]) {
    const sourceId = flowluSourceIdFromArticleCode(articlePathMatch[1]);
    return sourceId ? { sourceId, hash } : null;
  }

  return null;
}

export function createFlowluArticleHrefRewriter(articleUrlBySourceId: Map<string, string>) {
  return (href: string): string => {
    const target = flowluSourceIdFromHref(href);
    if (!target) {
      return href;
    }

    const articleUrl = articleUrlBySourceId.get(target.sourceId);
    return articleUrl ? `${articleUrl}${target.hash}` : href;
  };
}
