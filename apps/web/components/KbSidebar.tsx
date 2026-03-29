import Link from 'next/link';
import Image from 'next/image';
import { apiFetch } from '../lib/api';
import { auth } from '../auth';
import type { Category, KnowledgeBase, Role } from '@dovetail/types';
import { SidebarCategories } from './SidebarCategories';
import { KbSwitcher } from './KbSwitcher';

export async function KbSidebar({ kbId, kbSlug }: { kbId: string; kbSlug: string }) {
  let categories: Category[] = [];
  let knowledgeBases: KnowledgeBase[] = [];

  try {
    [categories, knowledgeBases] = await Promise.all([
      apiFetch<Category[]>(`/api/knowledge-bases/${kbId}/categories`),
      apiFetch<KnowledgeBase[]>('/api/knowledge-bases'),
    ]);
  } catch {
    // API unavailable
  }

  const session = await auth();
  const userRole: Role = (session?.user?.role as Role) ?? 'viewer';

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
        <KbSwitcher knowledgeBases={knowledgeBases} currentSlug={kbSlug} />
      </div>

      <nav aria-label="Categories" className="flex-1 overflow-y-auto py-3">
        <SidebarCategories categories={categories} userRole={userRole} kbSlug={kbSlug} />
      </nav>
    </>
  );
}
