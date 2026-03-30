export const DEV_RAG_API_KEY = 'dovetail-dev-rag-key';

export const DEV_USERS = {
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

const DEFAULT_KB_ID = '00000000-0000-0000-0000-000000000001';

export const DEV_KNOWLEDGE_BASES = {
  default: {
    id: DEFAULT_KB_ID,
    name: 'Housing',
    slug: 'housing',
    description: 'Housing knowledge base',
  },
};

export const DEV_CATEGORIES = {
  housing: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Housing',
    slug: 'housing',
    parentId: null,
    knowledgeBaseId: DEFAULT_KB_ID,
  },
  evictions: {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Evictions',
    slug: 'evictions',
    parentId: '10000000-0000-4000-8000-000000000001',
    knowledgeBaseId: DEFAULT_KB_ID,
  },
};

export const DEV_TAGS = {
  intake: {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Intake',
    slug: 'intake',
    knowledgeBaseId: DEFAULT_KB_ID,
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

export const DEV_ARTICLES = {
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
