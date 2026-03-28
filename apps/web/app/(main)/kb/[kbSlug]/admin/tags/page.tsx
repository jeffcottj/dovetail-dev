import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../../../lib/api';
import { RoleGate } from '../../../../../../components/RoleGate';
import { TagList } from '../../../../admin/tags/TagList';
import type { KnowledgeBase, Tag } from '@dovetail/types';

async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  try {
    const kbs = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
    return kbs.find(kb => kb.slug === slug) ?? null;
  } catch { return null; }
}

export default async function KbTagsPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  let tags: Tag[] = [];
  try {
    tags = await apiFetch<Tag[]>(`/api/knowledge-bases/${kb.id}/tags`);
  } catch {}

  return (
    <RoleGate minimumRole="admin">
      <main id="main-content" className="flex-1 p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink mb-2">
          Tag Management
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-6">
          Create and manage tags for this knowledge base.
        </p>
        <TagList initialTags={tags} />
      </main>
    </RoleGate>
  );
}
