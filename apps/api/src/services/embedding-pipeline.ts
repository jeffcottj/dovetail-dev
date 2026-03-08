import { eq } from 'drizzle-orm';
import { db, articleEmbeddings, articles } from '@dovetail/db';
import { createEmbeddingProvider } from './embeddings.js';
import { extractText } from '../utils/tiptap.js';

export function chunkText(text: string, maxChars = 2000, overlap = 200): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }
  return chunks;
}

export async function generateEmbeddings(articleId: string): Promise<void> {
  const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
  if (!article) return;

  const text = extractText(article.content);
  if (!text.trim()) return;

  const chunks = chunkText(text);
  const provider = createEmbeddingProvider();
  const embeddings = await provider.embedMany(chunks);

  await db.transaction(async (tx) => {
    await tx.delete(articleEmbeddings).where(eq(articleEmbeddings.articleId, articleId));
    await tx.insert(articleEmbeddings).values(
      chunks.map((chunk, i) => ({
        articleId,
        chunkIndex: i,
        chunkText: chunk,
        embedding: embeddings[i],
      })),
    );
  });
}
