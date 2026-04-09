import Link from 'next/link';
import Image from 'next/image';
import type { KnowledgeBase } from '@dovetail/types';
import { apiFetch } from '../lib/api';
import { KbSwitcher } from './KbSwitcher';

export async function WorkspaceSidebar() {
  let knowledgeBases: KnowledgeBase[] = [];

  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {
    // API unavailable
  }

  return (
    <>
      <div className="h-24 flex items-center px-4 border-b border-sidebar-hover shrink-0">
        <Link href="/" className="block">
          <Image
            src="/logos/mla-primary-white.png"
            alt="Maryland Legal Aid"
            width={220}
            height={92}
            className="w-auto"
            priority
          />
        </Link>
      </div>

      <div className="px-3 py-3 border-b border-sidebar-hover">
        <KbSwitcher knowledgeBases={knowledgeBases} currentSlug={null} />
      </div>

      <div className="flex-1" />
    </>
  );
}
