export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey = process.env.OPENAI_API_KEY!;
  private model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
  private baseUrl = process.env.EMBEDDING_BASE_URL ?? 'https://api.openai.com/v1';

  async embed(text: string): Promise<number[]> {
    const results = await this.embedMany([text]);
    return results[0];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    const json = await res.json();
    return json.data.map((d: { embedding: number[] }) => d.embedding);
  }
}

class OllamaEmbeddingProvider implements EmbeddingProvider {
  private model = process.env.EMBEDDING_MODEL ?? 'nomic-embed-text';
  private baseUrl = process.env.EMBEDDING_BASE_URL ?? 'http://localhost:11434';

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: text }),
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const json = await res.json();
    return json.embeddings[0];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER ?? 'openai';
  if (provider === 'openai') return new OpenAIEmbeddingProvider();
  if (provider === 'ollama') return new OllamaEmbeddingProvider();
  throw new Error(`Unknown embedding provider: ${provider}`);
}
