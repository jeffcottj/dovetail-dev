import Link from 'next/link';
import { apiFetch } from '../lib/api';
import type { Category } from '@dovetail/types';
import { SidebarTree } from './SidebarTree';

export async function Sidebar() {
  let categories: Category[] = [];
  try {
    categories = await apiFetch<Category[]>('/api/categories');
  } catch {
    // API unavailable — render empty sidebar
  }

  return (
    <aside className="w-64 shrink-0 bg-sidebar text-sidebar-text min-h-screen flex flex-col border-r border-sidebar-hover">
      <div className="p-5 border-b border-sidebar-hover">
        <Link href="/" className="block">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-sidebar-text-active tracking-tight">
            Dovetail
          </h1>
          <span className="text-xs text-sidebar-text/60 font-[family-name:var(--font-ui)] uppercase tracking-widest">
            Knowledge Base
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <div className="px-4 py-2">
          <span className="text-[10px] font-[family-name:var(--font-ui)] uppercase tracking-widest text-sidebar-text/40 font-semibold">
            Categories
          </span>
        </div>
        <SidebarTree categories={categories} />
      </nav>
    </aside>
  );
}
