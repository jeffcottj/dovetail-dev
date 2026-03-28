import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../../../lib/api';
import { RoleGate } from '../../../../../../components/RoleGate';
import type { KnowledgeBase, User } from '@dovetail/types';
import { KbUserManager } from './KbUserManager';

async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  try {
    const kbs = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
    return kbs.find(kb => kb.slug === slug) ?? null;
  } catch { return null; }
}

interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number; }

export default async function KbUsersPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  let users: User[] = [];
  try {
    const res = await apiFetch<PaginatedResponse<User>>('/api/admin/users?limit=200');
    users = res.data;
  } catch {}

  return (
    <RoleGate minimumRole="admin">
      <main id="main-content" className="flex-1 p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink mb-2">
          Users & Roles
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-6">
          Manage user role overrides for this knowledge base.
        </p>
        <KbUserManager users={users} kbId={kb.id} />
      </main>
    </RoleGate>
  );
}
