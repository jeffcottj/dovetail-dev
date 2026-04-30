import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api-client.js';
import { ApiClientError } from '../errors.js';
import type { McpConfig } from '../config.js';

const config: McpConfig = {
  apiBaseUrl: 'http://api.test',
  apiKey: 'k-test',
  port: 3002,
  requestTimeoutMs: 5000,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api-client', () => {
  it('sends Authorization header with bearer key', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = createApiClient({ config, fetcher });
    await client.listKnowledgeBases();
    const init = (fetcher as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer k-test');
  });

  it('returns parsed body on success', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse([{ id: '1', name: 'KB' }]));
    const client = createApiClient({ config, fetcher });
    const out = await client.listKnowledgeBases();
    expect(out).toEqual([{ id: '1', name: 'KB' }]);
  });

  it('maps 401 to unauthorized error', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: 'Bad key' }, 401));
    const client = createApiClient({ config, fetcher });
    await expect(client.listKnowledgeBases()).rejects.toMatchObject({ kind: 'unauthorized' });
  });

  it('maps 403 to forbidden error', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: 'no scope' }, 403));
    const client = createApiClient({ config, fetcher });
    await expect(client.listCategories('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('maps 404 to not_found error', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: 'missing' }, 404));
    const client = createApiClient({ config, fetcher });
    await expect(client.getArticle('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('maps 400 to validation error and surfaces details', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad', details: [{ path: 'query' }] }, 400));
    const client = createApiClient({ config, fetcher });
    await expect(
      client.searchArticles({ query: 'x', knowledgeBaseIds: ['00000000-0000-0000-0000-000000000000'] }),
    ).rejects.toMatchObject({ kind: 'validation', details: [{ path: 'query' }] });
  });

  it('maps fetch failure to network error', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const client = createApiClient({ config, fetcher });
    await expect(client.listKnowledgeBases()).rejects.toBeInstanceOf(ApiClientError);
    await expect(client.listKnowledgeBases()).rejects.toMatchObject({ kind: 'network' });
  });

  it('builds query params for by-path lookup', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: 'a' }));
    const client = createApiClient({ config, fetcher });
    await client.getArticleByPath({ knowledgeBaseSlug: 'kb', path: 'cat/article' });
    const url = (fetcher as any).mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/rag/articles/by-path?');
    expect(url).toContain('knowledgeBaseSlug=kb');
    expect(url).toContain('path=cat%2Farticle');
  });

  it('unwraps results array for search and related', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ results: [{ articleId: 'a' }] })));
    const client = createApiClient({ config, fetcher });
    const search = await client.searchArticles({
      query: 'x',
      knowledgeBaseIds: ['00000000-0000-0000-0000-000000000000'],
    });
    expect(search).toEqual([{ articleId: 'a' }]);

    const related = await client.suggestRelatedArticles({ query: 'x' });
    expect(related).toEqual([{ articleId: 'a' }]);
  });
});
