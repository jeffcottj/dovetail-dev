'use client';

import { useRouter } from 'next/navigation';
import type { KnowledgeBase } from '@dovetail/types';

export function KbSwitcher({ knowledgeBases, currentSlug }: { knowledgeBases: KnowledgeBase[]; currentSlug: string }) {
  const router = useRouter();

  return (
    <select
      value={currentSlug}
      onChange={(e) => router.push(`/kb/${e.target.value}`)}
      className="w-full px-3 py-2 text-sm rounded-md bg-sidebar-hover text-sidebar-text border border-sidebar-hover font-[family-name:var(--font-ui)]"
    >
      {knowledgeBases.map((kb) => (
        <option key={kb.id} value={kb.slug}>{kb.name}</option>
      ))}
    </select>
  );
}
