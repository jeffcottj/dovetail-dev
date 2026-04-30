import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../errors.js';
import type { ApiClient } from '../api-client.js';
import {
  listKnowledgeBasesTool,
  listCategoriesTool,
  searchArticlesTool,
  getArticleTool,
  getArticleCitationsTool,
  suggestRelatedArticlesTool,
} from '../tools/index.js';

const KB_ID = '00000000-0000-4000-8000-000000000001';
const ARTICLE_ID = '00000000-0000-4000-8000-000000000010';

function client(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listKnowledgeBases: vi.fn().mockResolvedValue([]),
    listCategories: vi.fn().mockResolvedValue([]),
    getArticle: vi.fn().mockResolvedValue({ id: ARTICLE_ID }),
    getArticleByPath: vi.fn().mockResolvedValue({ id: ARTICLE_ID }),
    getArticleCitations: vi.fn().mockResolvedValue({ article: { id: ARTICLE_ID }, chunks: [] }),
    searchArticles: vi.fn().mockResolvedValue([]),
    suggestRelatedArticles: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function structured(result: { structuredContent?: unknown }) {
  return result.structuredContent;
}

describe('list_knowledge_bases', () => {
  it('returns kbs from upstream', async () => {
    const c = client({ listKnowledgeBases: vi.fn().mockResolvedValue([{ id: KB_ID, name: 'KB' }]) });
    const result = await listKnowledgeBasesTool.handler(undefined as never, { client: c });
    expect(structured(result)).toEqual({ knowledgeBases: [{ id: KB_ID, name: 'KB' }] });
  });

  it('surfaces upstream errors as MCP tool errors', async () => {
    const c = client({
      listKnowledgeBases: vi.fn().mockRejectedValue(new ApiClientError('unauthorized', 'bad key')),
    });
    const result = await listKnowledgeBasesTool.handler(undefined as never, { client: c });
    expect(result.isError).toBe(true);
  });
});

describe('list_categories', () => {
  it('passes knowledgeBaseId to client', async () => {
    const listCategories = vi.fn().mockResolvedValue([{ id: 'c1' }]);
    const c = client({ listCategories });
    const result = await listCategoriesTool.handler({ knowledgeBaseId: KB_ID } as never, { client: c });
    expect(listCategories).toHaveBeenCalledWith(KB_ID);
    expect(structured(result)).toEqual({ knowledgeBaseId: KB_ID, categories: [{ id: 'c1' }] });
  });

  it('returns forbidden error when KB outside scope', async () => {
    const c = client({
      listCategories: vi.fn().mockRejectedValue(new ApiClientError('forbidden', 'no scope')),
    });
    const result = await listCategoriesTool.handler({ knowledgeBaseId: KB_ID } as never, { client: c });
    expect(result.isError).toBe(true);
  });
});

describe('search_articles', () => {
  it('caps limit at 20', async () => {
    const searchArticles = vi.fn().mockResolvedValue([]);
    const c = client({ searchArticles });
    await searchArticlesTool.handler({ query: 'x', knowledgeBaseIds: [KB_ID], limit: 999 } as never, { client: c });
    expect(searchArticles.mock.calls[0][0].limit).toBe(20);
  });

  it('defaults limit to 5', async () => {
    const searchArticles = vi.fn().mockResolvedValue([]);
    const c = client({ searchArticles });
    await searchArticlesTool.handler({ query: 'x', knowledgeBaseIds: [KB_ID] } as never, { client: c });
    expect(searchArticles.mock.calls[0][0].limit).toBe(5);
  });

  it('falls back to allowed KBs when none provided', async () => {
    const listKnowledgeBases = vi.fn().mockResolvedValue([{ id: KB_ID, name: 'KB' }]);
    const searchArticles = vi.fn().mockResolvedValue([]);
    const c = client({ listKnowledgeBases, searchArticles });
    await searchArticlesTool.handler({ query: 'x' } as never, { client: c });
    expect(listKnowledgeBases).toHaveBeenCalled();
    expect(searchArticles.mock.calls[0][0].knowledgeBaseIds).toEqual([KB_ID]);
  });

  it('returns empty results when API key has no allowed KBs', async () => {
    const searchArticles = vi.fn();
    const c = client({ listKnowledgeBases: vi.fn().mockResolvedValue([]), searchArticles });
    const result = await searchArticlesTool.handler({ query: 'x' } as never, { client: c });
    expect(searchArticles).not.toHaveBeenCalled();
    expect(structured(result)).toEqual({ results: [] });
  });
});

describe('get_article', () => {
  it('fetches by articleId', async () => {
    const getArticle = vi.fn().mockResolvedValue({ id: ARTICLE_ID, title: 't' });
    const c = client({ getArticle });
    const result = await getArticleTool.handler({ articleId: ARTICLE_ID } as never, { client: c });
    expect(getArticle).toHaveBeenCalledWith(ARTICLE_ID);
    expect(structured(result)).toEqual({ article: { id: ARTICLE_ID, title: 't' } });
  });

  it('fetches by knowledgeBaseSlug+path', async () => {
    const getArticleByPath = vi.fn().mockResolvedValue({ id: ARTICLE_ID });
    const c = client({ getArticleByPath });
    await getArticleTool.handler({ knowledgeBaseSlug: 'kb', path: 'cat/a' } as never, { client: c });
    expect(getArticleByPath).toHaveBeenCalledWith({ knowledgeBaseSlug: 'kb', knowledgeBaseId: undefined, path: 'cat/a' });
  });

  it('errors when both articleId and path supplied', async () => {
    const c = client();
    const result = await getArticleTool.handler(
      { articleId: ARTICLE_ID, knowledgeBaseSlug: 'kb', path: 'cat/a' } as never,
      { client: c },
    );
    expect(result.isError).toBe(true);
  });

  it('errors when no lookup criteria provided', async () => {
    const c = client();
    const result = await getArticleTool.handler({} as never, { client: c });
    expect(result.isError).toBe(true);
  });

  it('errors when both KB id and slug supplied', async () => {
    const c = client();
    const result = await getArticleTool.handler(
      { knowledgeBaseId: KB_ID, knowledgeBaseSlug: 'kb', path: 'cat/a' } as never,
      { client: c },
    );
    expect(result.isError).toBe(true);
  });

  it('propagates not_found from upstream', async () => {
    const c = client({ getArticle: vi.fn().mockRejectedValue(new ApiClientError('not_found', 'gone')) });
    const result = await getArticleTool.handler({ articleId: ARTICLE_ID } as never, { client: c });
    expect(result.isError).toBe(true);
  });
});

describe('get_article_citations', () => {
  it('returns article + chunks', async () => {
    const payload = { article: { id: ARTICLE_ID }, chunks: [{ sourceType: 'article', chunkIndex: 0 }] };
    const c = client({ getArticleCitations: vi.fn().mockResolvedValue(payload) });
    const result = await getArticleCitationsTool.handler({ articleId: ARTICLE_ID } as never, { client: c });
    expect(structured(result)).toEqual(payload);
  });
});

describe('suggest_related_articles', () => {
  it('requires exactly one of articleId or query', async () => {
    const c = client();
    const both = await suggestRelatedArticlesTool.handler(
      { articleId: ARTICLE_ID, query: 'x' } as never,
      { client: c },
    );
    const neither = await suggestRelatedArticlesTool.handler({} as never, { client: c });
    expect(both.isError).toBe(true);
    expect(neither.isError).toBe(true);
  });

  it('caps limit at 20 and defaults to 5', async () => {
    const suggestRelatedArticles = vi.fn().mockResolvedValue([]);
    const c = client({ suggestRelatedArticles });
    await suggestRelatedArticlesTool.handler({ query: 'x', limit: 999 } as never, { client: c });
    expect(suggestRelatedArticles.mock.calls[0][0].limit).toBe(20);
    await suggestRelatedArticlesTool.handler({ query: 'x' } as never, { client: c });
    expect(suggestRelatedArticles.mock.calls[1][0].limit).toBe(5);
  });

  it('passes through articleId', async () => {
    const suggestRelatedArticles = vi.fn().mockResolvedValue([]);
    const c = client({ suggestRelatedArticles });
    await suggestRelatedArticlesTool.handler({ articleId: ARTICLE_ID } as never, { client: c });
    expect(suggestRelatedArticles.mock.calls[0][0].articleId).toBe(ARTICLE_ID);
  });
});
