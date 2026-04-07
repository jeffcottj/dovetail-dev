# Seed Data Expansion Design

Expand the dev seed data to reflect the full complexity of the application: multiple knowledge bases, KB-scoped roles, category-scoped roles, richer content hierarchies, and scoped API keys.

## Approach

Expand `seed-data.ts` inline (no structural change). Update `seed.ts` to insert the new data. Update `apps/web/lib/dev-auth.ts` to include all 6 users on the login page.

## Users

### Existing (unchanged)

| Key | Name | Global Role |
|-----|------|-------------|
| `admin` | Local Admin | admin |
| `editor` | Local Editor | editor |
| `viewer` | Local Viewer | viewer |

### New

| Key | Name | Global Role | Override |
|-----|------|-------------|----------|
| `kbAdmin` | KB Admin (Housing) | viewer | admin on Housing KB via `userKbRoles` |
| `kbEditor` | KB Editor (Consumer) | viewer | editor on Consumer KB via `userKbRoles` |
| `categoryEditor` | Category Editor | viewer | editor on Custody category (Family KB) via `userCategoryRoles` |

All new users have `viewer` as their global role so the override is clearly what grants elevated access. Names describe their effective role for self-documenting login buttons.

## Knowledge Bases

| Key | Name | Slug | Description |
|-----|------|------|-------------|
| `housing` | Housing | `housing` | Housing law knowledge base *(existing)* |
| `family` | Family | `family` | Family law knowledge base |
| `consumer` | Consumer | `consumer` | Consumer protection knowledge base |

## Categories

### Housing KB

- Housing (root) -- existing
  - Evictions -- existing
  - Repairs -- new

### Family KB

- Family (root)
  - Custody
  - Child Support
    - Modifications (3rd level -- tests deeper hierarchy)

### Consumer KB

- Consumer (root)
  - Debt Collection
  - Auto Fraud

## Tags

| Tag | Slug | Knowledge Base |
|-----|------|---------------|
| Intake | `intake` | Housing *(existing)* |
| Landlord-Tenant | `landlord-tenant` | Housing |
| Filing | `filing` | Family |
| Guidelines | `guidelines` | Family |
| Debt | `debt` | Consumer |
| Fraud | `fraud` | Consumer |

## Articles

### Housing KB

| Title | Status | Category | Author | Tags |
|-------|--------|----------|--------|------|
| Notice Requirements for Evictions *(existing)* | published | Evictions | admin | intake, landlord-tenant |
| Eviction Intake Checklist Draft *(existing)* | draft | Evictions | editor | -- |
| Tenant's Right to Repairs | published | Repairs | editor | landlord-tenant |

"Notice Requirements for Evictions" contains an inline Tiptap link node pointing to "Tenant's Right to Repairs" (stored as a relative URL like `/kb/housing/articles/tenants-right-to-repairs` in the Tiptap JSON content).

### Family KB

| Title | Status | Category | Author | Tags |
|-------|--------|----------|--------|------|
| Filing for Custody in Maryland | published | Custody | admin | filing |
| Child Support Guidelines Overview | published | Child Support | kbAdmin | guidelines |
| Modifying a Child Support Order | draft | Modifications | editor | -- |

"Filing for Custody in Maryland" has a seeded attachment: `ccdr004.pdf` (Maryland CC-DR-004 Complaint for Custody form, from `sample-data/ccdr004.pdf`).

### Consumer KB

| Title | Status | Category | Author | Tags |
|-------|--------|----------|--------|------|
| Know Your Rights: Debt Collection | published | Debt Collection | kbEditor | debt |
| Responding to a Debt Lawsuit | published | Debt Collection | admin | debt |
| Identifying Auto Fraud | draft | Auto Fraud | editor | fraud |

## Article Versions

Every published article gets a version 1 entry in `articleVersions`.

## Attachment

| Filename | Storage Path | MIME Type | Size | Linked To |
|----------|-------------|-----------|------|-----------|
| ccdr004.pdf | sample-data/ccdr004.pdf | application/pdf | 173734 | Filing for Custody in Maryland |

## KB Role Overrides (`userKbRoles`)

| User | Knowledge Base | Role |
|------|---------------|------|
| kbAdmin | Housing | admin |
| kbEditor | Consumer | editor |

## Category Role Overrides (`userCategoryRoles`)

| User | Category | Role |
|------|----------|------|
| categoryEditor | Custody (Family KB) | editor |

## API Keys

| Name | Scoped To |
|------|-----------|
| Local Dev RAG Key *(existing)* | Housing only (via `apiKeyKnowledgeBases`) |
| Local Dev RAG Key (All KBs) *(new)* | Unscoped (no `apiKeyKnowledgeBases` entry) |

Both keys use deterministic plaintext values exported from `seed-data.ts` so smoke tests can reference them.

## Files Changed

1. `packages/db/src/seed-data.ts` -- all new constants added inline
2. `packages/db/src/seed.ts` -- insert new data (KB roles, category roles, API key scoping, new articles/categories/tags, attachment)
3. `apps/web/lib/dev-auth.ts` -- add 3 new users to DEV_USERS
4. `packages/db/src/__tests__/seed.test.ts` -- update to cover new KBs/users

## Not in Scope

- Seeding `adminActivityEvents` or `importJobs`
- Changing the embedding seed logic (still only runs for published articles when `SEED_WITH_EMBEDDINGS=true`)
- Modifying any API routes or middleware
