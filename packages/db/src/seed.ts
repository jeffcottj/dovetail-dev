import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });

const DEV_RAG_API_KEY = 'dovetail-dev-rag-key';
const SHOULD_SEED_EMBEDDINGS = process.env.SEED_WITH_EMBEDDINGS === 'true';

const DEV_USERS = {
  admin: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@local.dovetail.test',
    name: 'Local Admin',
    role: 'admin' as const,
    provider: 'google' as const,
    providerId: 'local-admin',
  },
  editor: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'editor@local.dovetail.test',
    name: 'Local Editor',
    role: 'editor' as const,
    provider: 'google' as const,
    providerId: 'local-editor',
  },
  viewer: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'viewer@local.dovetail.test',
    name: 'Local Viewer',
    role: 'viewer' as const,
    provider: 'google' as const,
    providerId: 'local-viewer',
  },
};

const DEV_CATEGORIES = {
  housing: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Housing',
    slug: 'housing',
    parentId: null,
  },
  evictions: {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Evictions',
    slug: 'evictions',
    parentId: '10000000-0000-4000-8000-000000000001',
  },
};

const DEV_TAGS = {
  intake: {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Intake',
    slug: 'intake',
  },
};

const PUBLISHED_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Tenants facing eviction should receive written notice before a landlord files in court.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Local staff should confirm the notice date, the filing date, and whether emergency relief options are available.',
        },
      ],
    },
  ],
};

const DRAFT_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Draft checklist for a same-day eviction intake interview.',
        },
      ],
    },
  ],
};

const DEV_ARTICLES = {
  published: {
    id: '30000000-0000-4000-8000-000000000001',
    title: 'Notice Requirements for Evictions',
    slug: 'notice-requirements-for-evictions',
    categoryId: DEV_CATEGORIES.evictions.id,
    authorId: DEV_USERS.admin.id,
    content: PUBLISHED_CONTENT,
    plainText:
      'Tenants facing eviction should receive written notice before a landlord files in court. Local staff should confirm the notice date, the filing date, and whether emergency relief options are available.',
    status: 'published' as const,
  },
  draft: {
    id: '30000000-0000-4000-8000-000000000002',
    title: 'Eviction Intake Checklist Draft',
    slug: 'eviction-intake-checklist-draft',
    categoryId: DEV_CATEGORIES.evictions.id,
    authorId: DEV_USERS.editor.id,
    content: DRAFT_CONTENT,
    plainText: 'Draft checklist for a same-day eviction intake interview.',
    status: 'draft' as const,
  },
};

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

  console.log('Generating embeddings for seeded published article...');
  const chunks = chunkText(DEV_ARTICLES.published.plainText);
  const embeddings = await embedMany(chunks);

  await db.insert(articleEmbeddings).values(
    chunks.map((chunk, index) => ({
      articleId: DEV_ARTICLES.published.id,
      chunkIndex: index,
      chunkText: chunk,
      embedding: embeddings[index],
    })),
  );
}

async function runSeed() {
  const { db } = await import('./connection.js');
  const {
    apiKeys,
    articleEmbeddings,
    articleTags,
    articleVersions,
    articles,
    categories,
    tags,
    userCategoryRoles,
    users,
  } = await import('./schema.js');
  const now = new Date();

  console.log('Resetting seeded development data...');

  await db.transaction(async (tx) => {
    await tx.delete(articleEmbeddings);
    await tx.delete(articleTags);
    await tx.delete(articleVersions);
    await tx.delete(apiKeys);
    await tx.delete(articles);
    await tx.delete(userCategoryRoles);
    await tx.delete(tags);
    await tx.delete(categories);
    await tx.delete(users);

    await tx.insert(users).values(Object.values(DEV_USERS));
    await tx.insert(categories).values(Object.values(DEV_CATEGORIES));
    await tx.insert(tags).values(Object.values(DEV_TAGS));
    await tx.insert(articles).values([
      {
        ...DEV_ARTICLES.published,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
      {
        ...DEV_ARTICLES.draft,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      },
    ]);
    await tx.insert(articleVersions).values({
      id: '40000000-0000-4000-8000-000000000001',
      articleId: DEV_ARTICLES.published.id,
      title: DEV_ARTICLES.published.title,
      content: DEV_ARTICLES.published.content,
      authorId: DEV_USERS.admin.id,
      versionNumber: 1,
      createdAt: now,
    });
    await tx.insert(articleTags).values({
      articleId: DEV_ARTICLES.published.id,
      tagId: DEV_TAGS.intake.id,
    });
    await tx.insert(apiKeys).values({
      id: '50000000-0000-4000-8000-000000000001',
      name: 'Local Dev RAG Key',
      keyHash: createHash('sha256').update(DEV_RAG_API_KEY).digest('hex'),
      createdBy: DEV_USERS.admin.id,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
    });
  });

  await seedEmbeddings();

  console.log('Seed complete.');
  console.log(`Admin login: ${DEV_USERS.admin.email}`);
  console.log(`Editor login: ${DEV_USERS.editor.email}`);
  console.log(`Viewer login: ${DEV_USERS.viewer.email}`);
  console.log(`Dev RAG API key: ${DEV_RAG_API_KEY}`);
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
