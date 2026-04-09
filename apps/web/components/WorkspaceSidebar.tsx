import Link from 'next/link';
import Image from 'next/image';
import type { KnowledgeBase } from '@dovetail/types';
import { apiFetch } from '../lib/api';
import { KbSwitcher } from './KbSwitcher';

export async function WorkspaceSidebar() {
  let knowledgeBases: KnowledgeBase[] = [];
  let knowledgeBasesUnavailable = false;

  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {
    knowledgeBasesUnavailable = true;
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
        {knowledgeBasesUnavailable ? (
          <p className="mt-3 text-sm font-[family-name:var(--font-ui)] text-sidebar-text/75">
            Knowledge bases are unavailable right now.
          </p>
        ) : knowledgeBases.length === 0 ? (
          <p className="mt-3 text-sm font-[family-name:var(--font-ui)] text-sidebar-text/75">
            No knowledge bases are available yet.
          </p>
        ) : null}
      </div>

      <div className="flex-1" />
    </>
  );
}
