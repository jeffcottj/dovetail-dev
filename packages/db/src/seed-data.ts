export const DEV_RAG_API_KEY = 'dovetail-dev-rag-key';
export const DEV_RAG_API_KEY_ALL = 'dovetail-dev-rag-key-all';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

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
  kbAdmin: {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'kb-admin@local.dovetail.test',
    name: 'KB Admin (Housing)',
    role: 'viewer' as const,
    provider: 'google' as const,
    providerId: 'local-kb-admin',
  },
  kbEditor: {
    id: '00000000-0000-4000-8000-000000000005',
    email: 'kb-editor@local.dovetail.test',
    name: 'KB Editor (Consumer)',
    role: 'viewer' as const,
    provider: 'google' as const,
    providerId: 'local-kb-editor',
  },
  categoryEditor: {
    id: '00000000-0000-4000-8000-000000000006',
    email: 'cat-editor@local.dovetail.test',
    name: 'Category Editor',
    role: 'viewer' as const,
    provider: 'google' as const,
    providerId: 'local-category-editor',
  },
};

// ---------------------------------------------------------------------------
// Knowledge Bases
// ---------------------------------------------------------------------------

const HOUSING_KB_ID = '00000000-0000-0000-0000-000000000001';
const FAMILY_KB_ID = '00000000-0000-0000-0000-000000000002';
const CONSUMER_KB_ID = '00000000-0000-0000-0000-000000000003';

export const DEV_KNOWLEDGE_BASES = {
  housing: {
    id: HOUSING_KB_ID,
    name: 'Housing',
    slug: 'housing',
    description: 'Housing knowledge base',
  },
  family: {
    id: FAMILY_KB_ID,
    name: 'Family',
    slug: 'family',
    description: 'Family law knowledge base',
  },
  consumer: {
    id: CONSUMER_KB_ID,
    name: 'Consumer',
    slug: 'consumer',
    description: 'Consumer protection knowledge base',
  },
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const DEV_CATEGORIES = {
  // Housing KB
  housing: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Housing',
    slug: 'housing',
    parentId: null,
    knowledgeBaseId: HOUSING_KB_ID,
  },
  evictions: {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Evictions',
    slug: 'evictions',
    parentId: '10000000-0000-4000-8000-000000000001',
    knowledgeBaseId: HOUSING_KB_ID,
  },
  repairs: {
    id: '10000000-0000-4000-8000-000000000003',
    name: 'Repairs',
    slug: 'repairs',
    parentId: '10000000-0000-4000-8000-000000000001',
    knowledgeBaseId: HOUSING_KB_ID,
  },
  // Family KB
  family: {
    id: '10000000-0000-4000-8000-000000000004',
    name: 'Family',
    slug: 'family',
    parentId: null,
    knowledgeBaseId: FAMILY_KB_ID,
  },
  custody: {
    id: '10000000-0000-4000-8000-000000000005',
    name: 'Custody',
    slug: 'custody',
    parentId: '10000000-0000-4000-8000-000000000004',
    knowledgeBaseId: FAMILY_KB_ID,
  },
  childSupport: {
    id: '10000000-0000-4000-8000-000000000006',
    name: 'Child Support',
    slug: 'child-support',
    parentId: '10000000-0000-4000-8000-000000000004',
    knowledgeBaseId: FAMILY_KB_ID,
  },
  modifications: {
    id: '10000000-0000-4000-8000-000000000007',
    name: 'Modifications',
    slug: 'modifications',
    parentId: '10000000-0000-4000-8000-000000000006',
    knowledgeBaseId: FAMILY_KB_ID,
  },
  // Consumer KB
  consumer: {
    id: '10000000-0000-4000-8000-000000000008',
    name: 'Consumer',
    slug: 'consumer',
    parentId: null,
    knowledgeBaseId: CONSUMER_KB_ID,
  },
  debtCollection: {
    id: '10000000-0000-4000-8000-000000000009',
    name: 'Debt Collection',
    slug: 'debt-collection',
    parentId: '10000000-0000-4000-8000-000000000008',
    knowledgeBaseId: CONSUMER_KB_ID,
  },
  autoFraud: {
    id: '10000000-0000-4000-8000-00000000000a',
    name: 'Auto Fraud',
    slug: 'auto-fraud',
    parentId: '10000000-0000-4000-8000-000000000008',
    knowledgeBaseId: CONSUMER_KB_ID,
  },
};

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export const DEV_TAGS = {
  // Housing
  intake: {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Intake',
    slug: 'intake',
    knowledgeBaseId: HOUSING_KB_ID,
  },
  landlordTenant: {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Landlord-Tenant',
    slug: 'landlord-tenant',
    knowledgeBaseId: HOUSING_KB_ID,
  },
  // Family
  filing: {
    id: '20000000-0000-4000-8000-000000000003',
    name: 'Filing',
    slug: 'filing',
    knowledgeBaseId: FAMILY_KB_ID,
  },
  guidelines: {
    id: '20000000-0000-4000-8000-000000000004',
    name: 'Guidelines',
    slug: 'guidelines',
    knowledgeBaseId: FAMILY_KB_ID,
  },
  // Consumer
  debt: {
    id: '20000000-0000-4000-8000-000000000005',
    name: 'Debt',
    slug: 'debt',
    knowledgeBaseId: CONSUMER_KB_ID,
  },
  fraud: {
    id: '20000000-0000-4000-8000-000000000006',
    name: 'Fraud',
    slug: 'fraud',
    knowledgeBaseId: CONSUMER_KB_ID,
  },
};

// ---------------------------------------------------------------------------
// Article Content (Tiptap JSON)
// ---------------------------------------------------------------------------

// Housing: Notice Requirements for Evictions (published)
// Contains a cross-link to the Repairs article
const NOTICE_REQUIREMENTS_CONTENT = {
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
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Tenants may also have claims related to habitability. See ' },
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: '/kb/housing/articles/tenants-right-to-repairs' } }],
          text: "Tenant's Right to Repairs",
        },
        { type: 'text', text: ' for more information.' },
      ],
    },
  ],
};

// Housing: Eviction Intake Checklist Draft
const EVICTION_CHECKLIST_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Draft checklist for a same-day eviction intake interview.' },
      ],
    },
  ],
};

// Housing: Tenant's Right to Repairs (published)
const REPAIRS_RIGHTS_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Maryland tenants have the right to safe and habitable housing. Landlords must maintain the property in compliance with local housing codes.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'If a landlord fails to make necessary repairs, tenants may file a rent escrow action in District Court. The tenant must give the landlord written notice and a reasonable opportunity to repair before filing.',
        },
      ],
    },
  ],
};

// Family: Filing for Custody in Maryland (published)
const CUSTODY_FILING_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'To file for custody in Maryland, use form CC-DR-004 (Complaint for Custody) in the Circuit Court for the county where the child lives.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'You must also complete a Civil Domestic Case Information Report (CC-DCM-001) and serve the other party with copies of all filed documents.',
        },
      ],
    },
  ],
};

// Family: Child Support Guidelines Overview (published)
const CHILD_SUPPORT_GUIDELINES_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Maryland uses an income shares model to calculate child support. Both parents\u2019 gross incomes are combined, and the obligation is divided based on each parent\u2019s share of the total.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'The guidelines are set out in Maryland Code, Family Law Article \u00A7 12-204. Courts may deviate from the guidelines if applying them would be unjust or inappropriate.',
        },
      ],
    },
  ],
};

// Family: Modifying a Child Support Order (draft)
const CHILD_SUPPORT_MODIFICATION_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'A party may request modification of a child support order if there has been a material change in circumstances since the order was entered.',
        },
      ],
    },
  ],
};

// Consumer: Know Your Rights: Debt Collection (published)
const DEBT_RIGHTS_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'The Fair Debt Collection Practices Act (FDCPA) prohibits debt collectors from using abusive, unfair, or deceptive practices to collect debts.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'You have the right to request validation of the debt within 30 days of first contact. The collector must cease collection activity until the debt is verified.',
        },
      ],
    },
  ],
};

// Consumer: Responding to a Debt Lawsuit (published)
const DEBT_LAWSUIT_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'If you are served with a debt collection lawsuit, you must file a response (called a Notice of Intention to Defend) within 30 days.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Common defenses include: the statute of limitations has expired, the debt has already been paid, or the amount claimed is incorrect. Failure to respond may result in a default judgment.',
        },
      ],
    },
  ],
};

// Consumer: Identifying Auto Fraud (draft)
const AUTO_FRAUD_CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Auto fraud includes odometer rollback, failure to disclose prior damage, and deceptive financing practices. Maryland\u2019s Consumer Protection Act covers these violations.',
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export const DEV_ARTICLES = {
  // Housing KB
  noticeRequirements: {
    id: '30000000-0000-4000-8000-000000000001',
    title: 'Notice Requirements for Evictions',
    slug: 'notice-requirements-for-evictions',
    categoryId: DEV_CATEGORIES.evictions.id,
    authorId: DEV_USERS.admin.id,
    content: NOTICE_REQUIREMENTS_CONTENT,
    plainText:
      'Tenants facing eviction should receive written notice before a landlord files in court. Local staff should confirm the notice date, the filing date, and whether emergency relief options are available. Tenants may also have claims related to habitability. See Tenant\'s Right to Repairs for more information.',
    status: 'published' as const,
  },
  evictionChecklist: {
    id: '30000000-0000-4000-8000-000000000002',
    title: 'Eviction Intake Checklist Draft',
    slug: 'eviction-intake-checklist-draft',
    categoryId: DEV_CATEGORIES.evictions.id,
    authorId: DEV_USERS.editor.id,
    content: EVICTION_CHECKLIST_CONTENT,
    plainText: 'Draft checklist for a same-day eviction intake interview.',
    status: 'draft' as const,
  },
  repairsRights: {
    id: '30000000-0000-4000-8000-000000000003',
    title: "Tenant's Right to Repairs",
    slug: 'tenants-right-to-repairs',
    categoryId: DEV_CATEGORIES.repairs.id,
    authorId: DEV_USERS.editor.id,
    content: REPAIRS_RIGHTS_CONTENT,
    plainText:
      'Maryland tenants have the right to safe and habitable housing. Landlords must maintain the property in compliance with local housing codes. If a landlord fails to make necessary repairs, tenants may file a rent escrow action in District Court. The tenant must give the landlord written notice and a reasonable opportunity to repair before filing.',
    status: 'published' as const,
  },
  // Family KB
  custodyFiling: {
    id: '30000000-0000-4000-8000-000000000004',
    title: 'Filing for Custody in Maryland',
    slug: 'filing-for-custody-in-maryland',
    categoryId: DEV_CATEGORIES.custody.id,
    authorId: DEV_USERS.admin.id,
    content: CUSTODY_FILING_CONTENT,
    plainText:
      'To file for custody in Maryland, use form CC-DR-004 (Complaint for Custody) in the Circuit Court for the county where the child lives. You must also complete a Civil Domestic Case Information Report (CC-DCM-001) and serve the other party with copies of all filed documents.',
    status: 'published' as const,
  },
  childSupportGuidelines: {
    id: '30000000-0000-4000-8000-000000000005',
    title: 'Child Support Guidelines Overview',
    slug: 'child-support-guidelines-overview',
    categoryId: DEV_CATEGORIES.childSupport.id,
    authorId: DEV_USERS.kbAdmin.id,
    content: CHILD_SUPPORT_GUIDELINES_CONTENT,
    plainText:
      "Maryland uses an income shares model to calculate child support. Both parents\u2019 gross incomes are combined, and the obligation is divided based on each parent\u2019s share of the total. The guidelines are set out in Maryland Code, Family Law Article \u00A7 12-204. Courts may deviate from the guidelines if applying them would be unjust or inappropriate.",
    status: 'published' as const,
  },
  childSupportModification: {
    id: '30000000-0000-4000-8000-000000000006',
    title: 'Modifying a Child Support Order',
    slug: 'modifying-a-child-support-order',
    categoryId: DEV_CATEGORIES.modifications.id,
    authorId: DEV_USERS.editor.id,
    content: CHILD_SUPPORT_MODIFICATION_CONTENT,
    plainText:
      'A party may request modification of a child support order if there has been a material change in circumstances since the order was entered.',
    status: 'draft' as const,
  },
  // Consumer KB
  debtRights: {
    id: '30000000-0000-4000-8000-000000000007',
    title: 'Know Your Rights: Debt Collection',
    slug: 'know-your-rights-debt-collection',
    categoryId: DEV_CATEGORIES.debtCollection.id,
    authorId: DEV_USERS.kbEditor.id,
    content: DEBT_RIGHTS_CONTENT,
    plainText:
      'The Fair Debt Collection Practices Act (FDCPA) prohibits debt collectors from using abusive, unfair, or deceptive practices to collect debts. You have the right to request validation of the debt within 30 days of first contact. The collector must cease collection activity until the debt is verified.',
    status: 'published' as const,
  },
  debtLawsuit: {
    id: '30000000-0000-4000-8000-000000000008',
    title: 'Responding to a Debt Lawsuit',
    slug: 'responding-to-a-debt-lawsuit',
    categoryId: DEV_CATEGORIES.debtCollection.id,
    authorId: DEV_USERS.admin.id,
    content: DEBT_LAWSUIT_CONTENT,
    plainText:
      'If you are served with a debt collection lawsuit, you must file a response (called a Notice of Intention to Defend) within 30 days. Common defenses include: the statute of limitations has expired, the debt has already been paid, or the amount claimed is incorrect. Failure to respond may result in a default judgment.',
    status: 'published' as const,
  },
  autoFraud: {
    id: '30000000-0000-4000-8000-000000000009',
    title: 'Identifying Auto Fraud',
    slug: 'identifying-auto-fraud',
    categoryId: DEV_CATEGORIES.autoFraud.id,
    authorId: DEV_USERS.editor.id,
    content: AUTO_FRAUD_CONTENT,
    plainText:
      "Auto fraud includes odometer rollback, failure to disclose prior damage, and deceptive financing practices. Maryland\u2019s Consumer Protection Act covers these violations.",
    status: 'draft' as const,
  },
};

// ---------------------------------------------------------------------------
// Article Versions (one per published article)
// ---------------------------------------------------------------------------

export const DEV_ARTICLE_VERSIONS = {
  noticeRequirements: {
    id: '40000000-0000-4000-8000-000000000001',
    articleId: DEV_ARTICLES.noticeRequirements.id,
    title: DEV_ARTICLES.noticeRequirements.title,
    content: DEV_ARTICLES.noticeRequirements.content,
    authorId: DEV_ARTICLES.noticeRequirements.authorId,
    versionNumber: 1,
  },
  repairsRights: {
    id: '40000000-0000-4000-8000-000000000002',
    articleId: DEV_ARTICLES.repairsRights.id,
    title: DEV_ARTICLES.repairsRights.title,
    content: DEV_ARTICLES.repairsRights.content,
    authorId: DEV_ARTICLES.repairsRights.authorId,
    versionNumber: 1,
  },
  custodyFiling: {
    id: '40000000-0000-4000-8000-000000000003',
    articleId: DEV_ARTICLES.custodyFiling.id,
    title: DEV_ARTICLES.custodyFiling.title,
    content: DEV_ARTICLES.custodyFiling.content,
    authorId: DEV_ARTICLES.custodyFiling.authorId,
    versionNumber: 1,
  },
  childSupportGuidelines: {
    id: '40000000-0000-4000-8000-000000000004',
    articleId: DEV_ARTICLES.childSupportGuidelines.id,
    title: DEV_ARTICLES.childSupportGuidelines.title,
    content: DEV_ARTICLES.childSupportGuidelines.content,
    authorId: DEV_ARTICLES.childSupportGuidelines.authorId,
    versionNumber: 1,
  },
  debtRights: {
    id: '40000000-0000-4000-8000-000000000005',
    articleId: DEV_ARTICLES.debtRights.id,
    title: DEV_ARTICLES.debtRights.title,
    content: DEV_ARTICLES.debtRights.content,
    authorId: DEV_ARTICLES.debtRights.authorId,
    versionNumber: 1,
  },
  debtLawsuit: {
    id: '40000000-0000-4000-8000-000000000006',
    articleId: DEV_ARTICLES.debtLawsuit.id,
    title: DEV_ARTICLES.debtLawsuit.title,
    content: DEV_ARTICLES.debtLawsuit.content,
    authorId: DEV_ARTICLES.debtLawsuit.authorId,
    versionNumber: 1,
  },
};

// ---------------------------------------------------------------------------
// Article Tags
// ---------------------------------------------------------------------------

export const DEV_ARTICLE_TAGS = [
  // Housing
  { articleId: DEV_ARTICLES.noticeRequirements.id, tagId: DEV_TAGS.intake.id },
  { articleId: DEV_ARTICLES.noticeRequirements.id, tagId: DEV_TAGS.landlordTenant.id },
  { articleId: DEV_ARTICLES.repairsRights.id, tagId: DEV_TAGS.landlordTenant.id },
  // Family
  { articleId: DEV_ARTICLES.custodyFiling.id, tagId: DEV_TAGS.filing.id },
  { articleId: DEV_ARTICLES.childSupportGuidelines.id, tagId: DEV_TAGS.guidelines.id },
  // Consumer
  { articleId: DEV_ARTICLES.debtRights.id, tagId: DEV_TAGS.debt.id },
  { articleId: DEV_ARTICLES.debtLawsuit.id, tagId: DEV_TAGS.debt.id },
  { articleId: DEV_ARTICLES.autoFraud.id, tagId: DEV_TAGS.fraud.id },
];

// ---------------------------------------------------------------------------
// KB Role Overrides
// ---------------------------------------------------------------------------

export const DEV_USER_KB_ROLES = [
  { userId: DEV_USERS.kbAdmin.id, knowledgeBaseId: HOUSING_KB_ID, role: 'admin' as const },
  { userId: DEV_USERS.kbEditor.id, knowledgeBaseId: CONSUMER_KB_ID, role: 'editor' as const },
];

// ---------------------------------------------------------------------------
// Category Role Overrides
// ---------------------------------------------------------------------------

export const DEV_USER_CATEGORY_ROLES = [
  { userId: DEV_USERS.categoryEditor.id, categoryId: DEV_CATEGORIES.custody.id, role: 'editor' as const },
];

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export const DEV_API_KEYS = {
  housingOnly: {
    id: '50000000-0000-4000-8000-000000000001',
    name: 'Local Dev RAG Key',
    plainText: DEV_RAG_API_KEY,
  },
  allKbs: {
    id: '50000000-0000-4000-8000-000000000002',
    name: 'Local Dev RAG Key (All KBs)',
    plainText: DEV_RAG_API_KEY_ALL,
  },
};

// The "housing only" key is scoped to Housing via apiKeyKnowledgeBases.
// The "all KBs" key has entries for every KB (the middleware treats empty as
// "no access", so explicit entries are needed for universal access).
export const DEV_API_KEY_KB_SCOPES = [
  { apiKeyId: DEV_API_KEYS.housingOnly.id, knowledgeBaseId: HOUSING_KB_ID },
  { apiKeyId: DEV_API_KEYS.allKbs.id, knowledgeBaseId: HOUSING_KB_ID },
  { apiKeyId: DEV_API_KEYS.allKbs.id, knowledgeBaseId: FAMILY_KB_ID },
  { apiKeyId: DEV_API_KEYS.allKbs.id, knowledgeBaseId: CONSUMER_KB_ID },
];

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

export const DEV_ATTACHMENTS = {
  custodyForm: {
    id: '60000000-0000-4000-8000-000000000001',
    articleId: DEV_ARTICLES.custodyFiling.id,
    filename: 'ccdr004.pdf',
    storagePath: 'sample-data/ccdr004.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 173716,
  },
};
