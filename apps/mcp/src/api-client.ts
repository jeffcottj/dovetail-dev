import type {
  RagArticle,
  RagCategory,
  RagCitation,
  RagKnowledgeBase,
  RagRelatedArticle,
  RagSearchResult,
} from '@dovetail/types';
import { ApiClientError, defaultMessageForKind, mapStatusToKind } from './errors.js';
import type { McpConfig } from './config.js';

export interface SearchArticlesInput {
  query: string;
  knowledgeBaseIds: string[];
  categoryIds?: string[];
  limit?: number;
}

export interface RelatedArticlesInput {
  articleId?: string;
  query?: string;
  knowledgeBaseIds?: string[];
  categoryIds?: string[];
  limit?: number;
}

export interface ArticleByPathInput {
  knowledgeBaseId?: string;
  knowledgeBaseSlug?: string;
  path: string;
}

export interface ArticleCitations {
  article: {
    id: string;
    title: string;
    url: string;
    knowledgeBase: { id: string; name: string; slug: string };
    categoryPath: string[];
    lastEditedAt: string;
    lastEditedBy: { id: string; name: string | null; email: string | null } | null;
  };
  chunks: RagCitation[];
}

export interface ApiClient {
  listKnowledgeBases(): Promise<RagKnowledgeBase[]>;
  listCategories(knowledgeBaseId: string): Promise<RagCategory[]>;
  getArticle(articleId: string): Promise<RagArticle>;
  getArticleByPath(input: ArticleByPathInput): Promise<RagArticle>;
  getArticleCitations(articleId: string): Promise<ArticleCitations>;
  searchArticles(input: SearchArticlesInput): Promise<RagSearchResult[]>;
  suggestRelatedArticles(input: RelatedArticlesInput): Promise<RagRelatedArticle[]>;
  ping(): Promise<boolean>;
}

type Fetcher = typeof fetch;

export interface CreateApiClientOptions {
  config: McpConfig;
  fetcher?: Fetcher;
}

export function createApiClient({ config, fetcher = fetch }: CreateApiClientOptions): ApiClient {
  const baseHeaders = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  function url(path: string, params?: Record<string, string | undefined>): string {
    const u = new URL(`${config.apiBaseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) u.searchParams.set(key, value);
      }
    }
    return u.toString();
  }

  async function request<T>(method: string, path: string, init: { body?: unknown; params?: Record<string, string | undefined> } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetcher(url(path, init.params), {
        method,
        headers: baseHeaders,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      throw new ApiClientError('network', defaultMessageForKind('network', (err as Error).message));
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const kind = mapStatusToKind(response.status);
      let details: unknown = null;
      let message = defaultMessageForKind(kind);
      try {
        const body = await response.json() as { error?: string; details?: unknown };
        if (body && typeof body === 'object') {
          if (typeof body.error === 'string') message = body.error;
          if (body.details !== undefined) details = body.details;
        }
      } catch {
        // No JSON body — keep default message.
      }
      throw new ApiClientError(kind, message, response.status, details);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  return {
    listKnowledgeBases() {
      return request<RagKnowledgeBase[]>('GET', '/api/v1/rag/knowledge-bases');
    },
    listCategories(knowledgeBaseId) {
      return request<RagCategory[]>(
        'GET',
        `/api/v1/rag/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/categories`,
      );
    },
    getArticle(articleId) {
      return request<RagArticle>('GET', `/api/v1/rag/articles/${encodeURIComponent(articleId)}`);
    },
    getArticleByPath(input) {
      return request<RagArticle>('GET', '/api/v1/rag/articles/by-path', {
        params: {
          knowledgeBaseId: input.knowledgeBaseId,
          knowledgeBaseSlug: input.knowledgeBaseSlug,
          path: input.path,
        },
      });
    },
    getArticleCitations(articleId) {
      return request<ArticleCitations>(
        'GET',
        `/api/v1/rag/articles/${encodeURIComponent(articleId)}/citations`,
      );
    },
    async searchArticles(input) {
      const body = await request<{ results: RagSearchResult[] }>('POST', '/api/v1/rag/search', { body: input });
      return body.results;
    },
    async suggestRelatedArticles(input) {
      const body = await request<{ results: RagRelatedArticle[] }>('POST', '/api/v1/rag/related-articles', { body: input });
      return body.results;
    },
    async ping() {
      try {
        await request<unknown>('GET', '/api/v1/rag/knowledge-bases');
        return true;
      } catch (err) {
        if (err instanceof ApiClientError && err.kind === 'unauthorized') return false;
        return false;
      }
    },
  };
}
