# Seed Data Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand dev seed data to exercise multi-KB routing, KB-scoped roles, category-scoped roles, richer content hierarchies, attachments, cross-links, and scoped API keys.

**Architecture:** All changes are in the seed layer (`packages/db/src/seed-data.ts`, `packages/db/src/seed.ts`), the dev-auth login page (`apps/web/lib/dev-auth.ts`), and the seed test. No API routes, middleware, or schema changes.

**Tech Stack:** TypeScript, Drizzle ORM, Tiptap JSON, Vitest

**Spec:** `docs/superpowers/specs/2026-04-07-seed-data-expansion-design.md`

---

## File Structure

- **Modify:** `packages/db/src/seed-data.ts` — all new constants (users, KBs, categories, tags, articles, role overrides, API keys, attachment)
- **Modify:** `packages/db/src/seed.ts` — insert new data, update embedding seed to cover all published articles
- **Modify:** `apps/web/lib/dev-auth.ts` — add 3 new users for login page
- **Modify:** `packages/db/src/__tests__/seed.test.ts` — cover new KBs, users, and data consistency

## ID Convention

Follows existing pattern — deterministic UUIDs grouped by entity type:

| Entity | Prefix | Example |
|--------|--------|---------|
| Users | `00000000-0000-4000-8000-` | `...000000000001` through `...000000000006` |
| Knowledge Bases | `00000000-0000-0000-0000-` | `...000000000001` through `...000000000003` |
| Categories | `10000000-0000-4000-8000-` | `...000000000001` through `...00000000000a` |
| Tags | `20000000-0000-4000-8000-` | `...000000000001` through `...000000000006` |
| Articles | `30000000-0000-4000-8000-` | `...000000000001` through `...000000000009` |
| Article Versions | `40000000-0000-4000-8000-` | `...000000000001` through `...000000000006` |
| API Keys | `50000000-0000-4000-8000-` | `...000000000001` through `...000000000002` |
| Attachments | `60000000-0000-4000-8000-` | `...000000000001` |

---

### Task 1: Add users, knowledge bases, categories, and tags to seed-data.ts

**Files:**
- Modify: `packages/db/src/seed-data.ts`

- [ ] **Step 1: Replace the full contents of `packages/db/src/seed-data.ts`**

Replace the entire file with the following. This adds 3 new users, 2 new KBs, 8 new categories, 5 new tags, and reorganizes existing data with clearer key names. Article content is a placeholder — Task 2 fills it in.

```ts
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/john/repos/dovetail && pnpm --filter @dovetail/db exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/seed-data.ts
git commit -m "feat(db): expand seed data constants for multi-KB testing"
```

---

### Task 2: Update seed.ts to insert all new data

**Files:**
- Modify: `packages/db/src/seed.ts`

- [ ] **Step 1: Replace the full contents of `packages/db/src/seed.ts`**

This updates the seed script to insert all new entities: 6 users, 3 KBs, 10 categories, 6 tags, 9 articles, 6 article versions, 8 article-tag associations, 2 KB role overrides, 1 category role override, 2 API keys with KB scoping, and 1 attachment. The embedding seed is updated to iterate over all published articles.

```ts
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/john/repos/dovetail && pnpm --filter @dovetail/db exec tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/seed.ts
git commit -m "feat(db): update seed script to insert expanded data"
```

---

### Task 3: Update dev-auth.ts with all 6 users

**Files:**
- Modify: `apps/web/lib/dev-auth.ts`

- [ ] **Step 1: Replace the `DEV_USERS` object in `apps/web/lib/dev-auth.ts`**

Add the 3 new users to the web app's `DEV_USERS` so they appear as login buttons. These must match the IDs, emails, names, and roles from `seed-data.ts`.

Replace the existing `DEV_USERS` const (lines 3-25) with:

```ts
export const DEV_USERS = {
  admin: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@local.dovetail.test',
    name: 'Local Admin',
    role: 'admin' as Role,
  },
  editor: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'editor@local.dovetail.test',
    name: 'Local Editor',
    role: 'editor' as Role,
  },
  viewer: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'viewer@local.dovetail.test',
    name: 'Local Viewer',
    role: 'viewer' as Role,
  },
  kbAdmin: {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'kb-admin@local.dovetail.test',
    name: 'KB Admin (Housing)',
    role: 'viewer' as Role,
  },
  kbEditor: {
    id: '00000000-0000-4000-8000-000000000005',
    email: 'kb-editor@local.dovetail.test',
    name: 'KB Editor (Consumer)',
    role: 'viewer' as Role,
  },
  categoryEditor: {
    id: '00000000-0000-4000-8000-000000000006',
    email: 'cat-editor@local.dovetail.test',
    name: 'Category Editor',
    role: 'viewer' as Role,
  },
} as const;
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/john/repos/dovetail && pnpm --filter @dovetail/web exec tsc --noEmit`
Expected: No errors (or only pre-existing warnings unrelated to this change)

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/dev-auth.ts
git commit -m "feat(web): add KB-scoped users to dev login page"
```

---

### Task 4: Update seed test

**Files:**
- Modify: `packages/db/src/__tests__/seed.test.ts`

- [ ] **Step 1: Write expanded test**

Replace the full contents of `packages/db/src/__tests__/seed.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import {
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
} from '../seed-data.js';

describe('development seed data', () => {
  it('has three knowledge bases with unique slugs', () => {
    const kbs = Object.values(DEV_KNOWLEDGE_BASES);
    expect(kbs).toHaveLength(3);
    const slugs = kbs.map((kb) => kb.slug);
    expect(new Set(slugs).size).toBe(3);
    expect(slugs).toContain('housing');
    expect(slugs).toContain('family');
    expect(slugs).toContain('consumer');
  });

  it('has six users with unique IDs and emails', () => {
    const users = Object.values(DEV_USERS);
    expect(users).toHaveLength(6);
    expect(new Set(users.map((u) => u.id)).size).toBe(6);
    expect(new Set(users.map((u) => u.email)).size).toBe(6);
  });

  it('has three global role levels across users', () => {
    const roles = Object.values(DEV_USERS).map((u) => u.role);
    expect(roles).toContain('admin');
    expect(roles).toContain('editor');
    expect(roles).toContain('viewer');
  });

  it('every category references a valid knowledge base', () => {
    const kbIds = new Set(Object.values(DEV_KNOWLEDGE_BASES).map((kb) => kb.id));
    for (const cat of Object.values(DEV_CATEGORIES)) {
      expect(kbIds.has(cat.knowledgeBaseId)).toBe(true);
    }
  });

  it('every article references a valid category and author', () => {
    const catIds = new Set(Object.values(DEV_CATEGORIES).map((c) => c.id));
    const userIds = new Set(Object.values(DEV_USERS).map((u) => u.id));
    for (const article of Object.values(DEV_ARTICLES)) {
      expect(catIds.has(article.categoryId)).toBe(true);
      expect(userIds.has(article.authorId)).toBe(true);
    }
  });

  it('every article version references a published article', () => {
    const publishedIds = new Set(
      Object.values(DEV_ARTICLES)
        .filter((a) => a.status === 'published')
        .map((a) => a.id),
    );
    for (const version of Object.values(DEV_ARTICLE_VERSIONS)) {
      expect(publishedIds.has(version.articleId)).toBe(true);
    }
  });

  it('every article tag references valid articles and tags', () => {
    const articleIds = new Set(Object.values(DEV_ARTICLES).map((a) => a.id));
    const tagIds = new Set(Object.values(DEV_TAGS).map((t) => t.id));
    for (const at of DEV_ARTICLE_TAGS) {
      expect(articleIds.has(at.articleId)).toBe(true);
      expect(tagIds.has(at.tagId)).toBe(true);
    }
  });

  it('KB role overrides reference valid users and knowledge bases', () => {
    const userIds = new Set(Object.values(DEV_USERS).map((u) => u.id));
    const kbIds = new Set(Object.values(DEV_KNOWLEDGE_BASES).map((kb) => kb.id));
    for (const override of DEV_USER_KB_ROLES) {
      expect(userIds.has(override.userId)).toBe(true);
      expect(kbIds.has(override.knowledgeBaseId)).toBe(true);
    }
  });

  it('category role overrides reference valid users and categories', () => {
    const userIds = new Set(Object.values(DEV_USERS).map((u) => u.id));
    const catIds = new Set(Object.values(DEV_CATEGORIES).map((c) => c.id));
    for (const override of DEV_USER_CATEGORY_ROLES) {
      expect(userIds.has(override.userId)).toBe(true);
      expect(catIds.has(override.categoryId)).toBe(true);
    }
  });

  it('attachment references a valid article', () => {
    const articleIds = new Set(Object.values(DEV_ARTICLES).map((a) => a.id));
    for (const att of Object.values(DEV_ATTACHMENTS)) {
      expect(articleIds.has(att.articleId)).toBe(true);
    }
  });

  it('has a 3-level category hierarchy in Family KB', () => {
    const { family, childSupport, modifications } = DEV_CATEGORIES;
    expect(family.parentId).toBeNull();
    expect(childSupport.parentId).toBe(family.id);
    expect(modifications.parentId).toBe(childSupport.id);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd /home/john/repos/dovetail && pnpm --filter @dovetail/db vitest run src/__tests__/seed.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/__tests__/seed.test.ts
git commit -m "test(db): expand seed data tests for multi-KB coverage"
```

---

### Task 5: Run the seed and verify

**Files:** None (verification only)

- [ ] **Step 1: Build the db package**

Run: `cd /home/john/repos/dovetail && pnpm --filter @dovetail/db build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Start Postgres if not running**

Run: `cd /home/john/repos/dovetail && docker compose up postgres -d`
Expected: Postgres container is running

- [ ] **Step 3: Run the seed script**

Run: `cd /home/john/repos/dovetail && pnpm --filter @dovetail/db db:migrate && node packages/db/dist/seed.js`
Expected: Output shows "Seed complete." followed by all 6 user logins and both RAG API keys. No errors.

- [ ] **Step 4: Verify data in the database**

Run a quick spot-check query:

```bash
cd /home/john/repos/dovetail && docker compose exec postgres psql -U dovetail -d dovetail -c "
  SELECT 'users' AS entity, count(*) FROM users
  UNION ALL SELECT 'knowledge_bases', count(*) FROM knowledge_bases
  UNION ALL SELECT 'categories', count(*) FROM categories
  UNION ALL SELECT 'tags', count(*) FROM tags
  UNION ALL SELECT 'articles', count(*) FROM articles
  UNION ALL SELECT 'article_versions', count(*) FROM article_versions
  UNION ALL SELECT 'article_tags', count(*) FROM article_tags
  UNION ALL SELECT 'user_kb_roles', count(*) FROM user_kb_roles
  UNION ALL SELECT 'user_category_roles', count(*) FROM user_category_roles
  UNION ALL SELECT 'api_keys', count(*) FROM api_keys
  UNION ALL SELECT 'api_key_kbs', count(*) FROM api_key_knowledge_bases
  UNION ALL SELECT 'attachments', count(*) FROM attachments
  ORDER BY 1;
"
```

Expected counts:

| Entity | Count |
|--------|-------|
| api_key_kbs | 4 |
| api_keys | 2 |
| article_tags | 8 |
| article_versions | 6 |
| articles | 9 |
| attachments | 1 |
| categories | 10 |
| knowledge_bases | 3 |
| tags | 6 |
| user_category_roles | 1 |
| user_kb_roles | 2 |
| users | 6 |

- [ ] **Step 5: Run the full test suite**

Run: `cd /home/john/repos/dovetail && pnpm test`
Expected: All tests pass. If any existing API tests fail, investigate — the seed data key renames (e.g. `DEV_ARTICLES.published` → `DEV_ARTICLES.noticeRequirements`) should NOT affect API tests since they use hardcoded UUIDs, not imports.

- [ ] **Step 6: Run smoke test (if dev servers are running)**

Run: `cd /home/john/repos/dovetail && just smoke`
Expected: All smoke checks pass. The smoke test checks for 'Housing knowledge base' in the home page, the housing KB slug, and the admin user ID — all unchanged.

---

## Notes

**API key scoping:** The spec originally described the "all KBs" key as having no `apiKeyKnowledgeBases` entries. However, the `apiKeyAuth` middleware (`apps/api/src/middleware/apiKeyAuth.ts:38-41`) treats an empty `allowedKbIds` array as "no access". So the plan explicitly inserts entries for all 3 KBs to give the second key universal access.

**Embedding seed:** The embedding logic is unchanged in behavior but updated to iterate over all published articles (previously hardcoded to one). Still gated behind `SEED_WITH_EMBEDDINGS=true`.
