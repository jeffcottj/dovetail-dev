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
