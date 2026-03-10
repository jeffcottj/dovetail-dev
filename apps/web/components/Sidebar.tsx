import Link from 'next/link';
import { apiFetch } from '../lib/api';
import { auth } from '../auth';
import type { Category, Role } from '@dovetail/types';
import { SidebarCategories } from './SidebarCategories';
import { UserMenu } from './UserMenu';

export async function Sidebar() {
  let categories: Category[] = [];
  try {
    categories = await apiFetch<Category[]>('/api/categories');
  } catch {
    // API unavailable — render empty sidebar
  }

  const session = await auth();
  const userRole: Role = (session?.user?.role as Role) ?? 'viewer';

  return (
    <>
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
        <SidebarCategories categories={categories} userRole={userRole} />
      </nav>

      <UserMenu />
    </>
  );
}
