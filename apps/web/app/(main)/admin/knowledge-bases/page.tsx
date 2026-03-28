import { apiFetch } from '../../../../lib/api';
import { RoleGate } from '../../../../components/RoleGate';
import type { KnowledgeBase } from '@dovetail/types';
import { KbManager } from './KbManager';

export default async function KnowledgeBasesAdminPage() {
  let knowledgeBases: KnowledgeBase[] = [];
  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {}

  return (
    <RoleGate minimumRole="admin">
      <main id="main-content" className="flex-1 p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink mb-6">
          Knowledge Bases
        </h1>
        <KbManager initialKbs={knowledgeBases} />
      </main>
    </RoleGate>
  );
}
