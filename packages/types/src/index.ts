export type Role = 'viewer' | 'editor' | 'admin';
export type OAuthProvider = 'google' | 'entra';
export type ArticleStatus = 'draft' | 'published' | 'archived';
export type KbDefaultAccess = 'org_viewer' | 'private';
export type AdminActivityKind =
  | 'user.created'
  | 'user.deleted'
  | 'user.role_changed'
  | 'kb.created'
  | 'kb.access_changed'
  | 'kb.deleted'
  | 'import.started'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'article.created'
  | 'article.edited';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  provider: OAuthProvider;
  createdAt: Date;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultAccess: KbDefaultAccess;
  createdAt: Date;
}

export interface AdminActivityItem {
  id: string;
  kind: AdminActivityKind;
  createdAt: string;
  actor: { id: string; name: string; email: string };
  knowledgeBase?: { id: string; name: string } | null;
  subject: { id: string; label: string };
  metadata: Record<string, unknown>;
}

export interface UserKbRole {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  role: Role;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  knowledgeBaseId: string;
  createdAt: Date;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryPath?: string[];  // e.g. ["housing", "rental"]
  knowledgeBaseSlug?: string;
  authorId: string;
  lastEditedById: string;
  lastEditedByName?: string | null;
  lastEditedByEmail?: string | null;
  content: unknown; // rich text JSON (Tiptap format)
  status: ArticleStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface WorkspaceSearchResult {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryPath?: string[];
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  knowledgeBaseSlug: string;
  authorId: string;
  lastEditedById: string;
  lastEditedByName?: string | null;
  lastEditedByEmail?: string | null;
  status: ArticleStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  rank?: number;
  similarity?: number;
  chunkText?: string;
  snippet?: string;
}

export type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

export interface SearchOptionCategory extends Category {
  knowledgeBaseName: string;
}

export interface SearchOptionTag extends Tag {
  knowledgeBaseName: string;
}

export interface SearchOptions {
  categories: SearchOptionCategory[];
  tags: SearchOptionTag[];
}

export interface StaleContentResult {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  categoryPath?: string[];
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  knowledgeBaseSlug: string;
  authorId: string;
  lastEditedById: string;
  lastEditedByName?: string | null;
  lastEditedByEmail?: string | null;
  status: ArticleStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  staleSince: Date | string;
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
  knowledgeBaseId: string;
}

export interface UserCategoryRole {
  categoryId: string;
  categoryName: string;
  role: Role;
}
