export type Role = 'viewer' | 'editor' | 'admin';
export type OAuthProvider = 'google' | 'entra';
export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  provider: OAuthProvider;
  createdAt: Date;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  createdAt: Date;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryPath?: string[];  // e.g. ["housing", "rental"]
  authorId: string;
  content: unknown; // rich text JSON (Tiptap format)
  status: ArticleStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface ArticleVersion {
  id: string;
  articleId: string;
  title: string;
  content: unknown;
  authorId: string;
  versionNumber: number;
  createdAt: Date;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface UserCategoryRole {
  categoryId: string;
  categoryName: string;
  role: Role;
}
