import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Save original env
const originalEnv = { ...process.env };

describe('createEmbeddingProvider', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns OpenAI provider by default', async () => {
    delete process.env.EMBEDDING_PROVIDER;
    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();
    expect(provider).toBeDefined();
    expect(provider.embed).toBeTypeOf('function');
    expect(provider.embedMany).toBeTypeOf('function');
  });

  it('returns OpenAI provider when EMBEDDING_PROVIDER=openai', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();
    expect(provider).toBeDefined();
  });

  it('returns Ollama provider when EMBEDDING_PROVIDER=ollama', async () => {
    process.env.EMBEDDING_PROVIDER = 'ollama';
    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();
    expect(provider).toBeDefined();
  });

  it('throws for unknown provider', async () => {
    process.env.EMBEDDING_PROVIDER = 'unknown';
    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    expect(() => createEmbeddingProvider()).toThrow('Unknown embedding provider: unknown');
  });
});

describe('OpenAIEmbeddingProvider', () => {
  it('calls OpenAI embeddings API and returns vectors', async () => {
    const mockResponse = {
      data: [
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';

    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();

    const results = await provider.embedMany(['hello', 'world']);
    expect(results).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({
      model: 'text-embedding-3-small',
      input: ['hello', 'world'],
    });

    fetchSpy.mockRestore();
  });

  it('embed() delegates to embedMany() and returns first result', async () => {
    const mockResponse = {
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';

    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();

    const result = await provider.embed('hello');
    expect(result).toEqual([0.1, 0.2, 0.3]);

    fetchSpy.mockRestore();
  });

  it('throws on API error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'bad-key';

    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();

    await expect(provider.embed('hello')).rejects.toThrow('OpenAI API error: 401');

    fetchSpy.mockRestore();
  });
});

describe('OllamaEmbeddingProvider', () => {
  it('calls Ollama embed API and returns vector', async () => {
    const mockResponse = { embeddings: [[0.7, 0.8, 0.9]] };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    process.env.EMBEDDING_PROVIDER = 'ollama';
    process.env.EMBEDDING_MODEL = 'nomic-embed-text';

    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();

    const result = await provider.embed('hello');
    expect(result).toEqual([0.7, 0.8, 0.9]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/embed');
    expect(JSON.parse(options?.body as string)).toEqual({
      model: 'nomic-embed-text',
      input: 'hello',
    });

    fetchSpy.mockRestore();
  });

  it('embedMany() calls embed() for each text', async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({ embeddings: [[callCount * 0.1, callCount * 0.2]] }),
        { status: 200 },
      );
    });

    process.env.EMBEDDING_PROVIDER = 'ollama';

    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();

    const results = await provider.embedMany(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    fetchSpy.mockRestore();
  });

  it('throws on API error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server error', { status: 500 }),
    );

    process.env.EMBEDDING_PROVIDER = 'ollama';

    const { createEmbeddingProvider } = await import('../../services/embeddings.js');
    const provider = createEmbeddingProvider();

    await expect(provider.embed('hello')).rejects.toThrow('Ollama API error: 500');

    fetchSpy.mockRestore();
  });
});
