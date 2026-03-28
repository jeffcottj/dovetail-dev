import { apiFetch } from './api';
import type { KnowledgeBase } from '@dovetail/types';

export async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  try {
    const kbs = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
    return kbs.find(kb => kb.slug === slug) ?? null;
  } catch {
    return null;
  }
}
