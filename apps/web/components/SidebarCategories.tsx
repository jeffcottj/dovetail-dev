'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { Category, Role } from '@dovetail/types';
import { hasMinimumRole } from '../lib/roles';
import { SidebarTree } from './SidebarTree';
import { CategoryModal } from './CategoryModal';

interface SidebarCategoriesProps {
  categories: Category[];
  userRole: Role;
}

export function SidebarCategories({
  categories,
  userRole,
}: SidebarCategoriesProps) {
  const router = useRouter();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const isEditor = hasMinimumRole(userRole, 'editor');

  return (
    <>
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-[10px] font-[family-name:var(--font-ui)] uppercase tracking-widest text-sidebar-text/70 font-semibold">
          Categories
        </span>
        {isEditor && (
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="w-5 h-5 flex items-center justify-center text-sidebar-text/40 hover:text-sidebar-text-active hover:bg-sidebar-hover rounded transition-colors"
            aria-label="New category"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <SidebarTree categories={categories} userRole={userRole} />

      <CategoryModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => router.refresh()}
        categories={categories}
      />
    </>
  );
}
