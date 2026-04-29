import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {
  DEV_API_KEY_KB_SCOPES,
  DEV_API_KEYS,
  DEV_ARTICLES,
  DEV_ARTICLE_TAGS,
  DEV_ARTICLE_VERSIONS,
  DEV_ATTACHMENTS,
  DEV_CATEGORIES,
  DEV_KNOWLEDGE_BASES,
  DEV_TAGS,
  DEV_USER_CATEGORY_ROLES,
  DEV_USER_KB_ROLES,
  DEV_USERS,
} from './seed-data.js';

config({ path: resolve(__dirname, '../../../.env') });

const SHOULD_SEED_EMBEDDINGS = process.env.SEED_WITH_EMBEDDINGS === 'true';

function chunkText(text: string, maxChars = 2000, overlap = 200): string[] {
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

async function embedMany(texts: string[]): Promise<number[][]> {
  const provider = process.env.EMBEDDING_PROVIDER ?? 'openai';
  const model = process.env.EMBEDDING_MODEL ?? (provider === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small');
  const baseUrl =
    process.env.EMBEDDING_BASE_URL ??
    (provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1');

  if (provider === 'ollama') {
    return Promise.all(texts.map(async (text) => {
      const res = await fetch(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text }),
      });
      if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
      const json = await res.json() as { embeddings: number[][] };
      return json.embeddings[0];
    }));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required when SEED_WITH_EMBEDDINGS=true and EMBEDDING_PROVIDER=openai');
  }

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const json = await res.json() as { data: Array<{ embedding: number[] }> };
  return json.data.map((entry) => entry.embedding);
}

async function seedEmbeddings() {
  const { db } = await import('./connection.js');
  const { articleEmbeddings } = await import('./schema.js');

  if (!SHOULD_SEED_EMBEDDINGS) {
    console.log('Skipping embedding seed.');
    return;
  }

  const publishedArticles = Object.values(DEV_ARTICLES).filter((a) => a.status === 'published');
  console.log(`Generating embeddings for ${publishedArticles.length} published articles...`);

  for (const article of publishedArticles) {
    const chunks = chunkText(article.plainText);
    const embeddings = await embedMany(chunks);

    await db.insert(articleEmbeddings).values(
      chunks.map((chunk, index) => ({
        articleId: article.id,
        chunkIndex: index,
        chunkText: chunk,
        embedding: embeddings[index],
      })),
    );
  }
}

async function runSeed() {
  const { db } = await import('./connection.js');
  const {
    apiKeyKnowledgeBases,
    apiKeys,
    articleEmbeddings,
    articleTags,
    articleVersions,
    articles,
    attachments,
    categories,
    importJobs,
    knowledgeBases,
    tags,
    userCategoryRoles,
    userKbRoles,
    users,
  } = await import('./schema.js');
  const now = new Date();

  console.log('Resetting seeded development data...');

  await db.transaction(async (tx) => {
    // Clear in dependency order
    await tx.delete(articleEmbeddings);
    await tx.delete(articleTags);
    await tx.delete(articleVersions);
    await tx.delete(attachments);
    await tx.delete(apiKeyKnowledgeBases);
    await tx.delete(apiKeys);
    await tx.delete(articles);
    await tx.delete(importJobs);
    await tx.delete(userCategoryRoles);
    await tx.delete(userKbRoles);
    await tx.delete(tags);
    await tx.delete(categories);
    await tx.delete(users);
    await tx.delete(knowledgeBases);

    // Core entities
    await tx.insert(users).values(Object.values(DEV_USERS));
    await tx.insert(knowledgeBases).values(Object.values(DEV_KNOWLEDGE_BASES));
    await tx.insert(categories).values(Object.values(DEV_CATEGORIES));
    await tx.insert(tags).values(Object.values(DEV_TAGS));

    // Articles
    const allArticles = Object.values(DEV_ARTICLES);
    await tx.insert(articles).values(
      allArticles.map((a) => ({
        ...a,
        lastEditedById: a.authorId,
        createdAt: now,
        updatedAt: now,
        publishedAt: a.status === 'published' ? now : null,
      })),
    );

    // Article versions (published articles only)
    await tx.insert(articleVersions).values(
      Object.values(DEV_ARTICLE_VERSIONS).map((v) => ({
        ...v,
        createdAt: now,
      })),
    );

    // Article tags
    await tx.insert(articleTags).values(DEV_ARTICLE_TAGS);

    // Attachment
    await tx.insert(attachments).values(
      Object.values(DEV_ATTACHMENTS).map((a) => ({
        ...a,
        createdAt: now,
      })),
    );

    // Role overrides
    await tx.insert(userKbRoles).values(DEV_USER_KB_ROLES);
    await tx.insert(userCategoryRoles).values(DEV_USER_CATEGORY_ROLES);

    // API keys
    for (const key of Object.values(DEV_API_KEYS)) {
      await tx.insert(apiKeys).values({
        id: key.id,
        name: key.name,
        keyHash: createHash('sha256').update(key.plainText).digest('hex'),
        createdBy: DEV_USERS.admin.id,
        createdAt: now,
        lastUsedAt: null,
        revokedAt: null,
      });
    }
    await tx.insert(apiKeyKnowledgeBases).values(DEV_API_KEY_KB_SCOPES);
  });

  await seedEmbeddings();

  console.log('Seed complete.');
  console.log(`Admin login:           ${DEV_USERS.admin.email}`);
  console.log(`Editor login:          ${DEV_USERS.editor.email}`);
  console.log(`Viewer login:          ${DEV_USERS.viewer.email}`);
  console.log(`KB Admin login:        ${DEV_USERS.kbAdmin.email}`);
  console.log(`KB Editor login:       ${DEV_USERS.kbEditor.email}`);
  console.log(`Category Editor login: ${DEV_USERS.categoryEditor.email}`);
  console.log(`Dev RAG API key (Housing): ${DEV_API_KEYS.housingOnly.plainText}`);
  console.log(`Dev RAG API key (All):     ${DEV_API_KEYS.allKbs.plainText}`);
}

runSeed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { client } = await import('./connection.js');
    await client.end({ timeout: 5 });
  });
