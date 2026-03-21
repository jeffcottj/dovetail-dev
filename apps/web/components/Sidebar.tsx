import Link from 'next/link';
import Image from 'next/image';
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
      <div className="p-4 border-b border-sidebar-hover">
        <Link href="/" className="block">
          <Image
            src="/logos/mla-secondary-white.png"
            alt="Maryland Legal Aid"
            width={220}
            height={92}
            className="w-full h-auto"
            priority
          />
        </Link>
      </div>

      <nav aria-label="Categories" className="flex-1 overflow-y-auto py-3">
        <SidebarCategories categories={categories} userRole={userRole} />
      </nav>

      <UserMenu />
    </>
  );
}
