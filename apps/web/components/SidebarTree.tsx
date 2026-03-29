'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Category, Role } from '@dovetail/types';
import { buildTree, type TreeNode } from '../lib/categories';
import { hasMinimumRole } from '../lib/roles';
import { DropdownMenu, DropdownItem } from './ui/DropdownMenu';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { CategoryModal } from './CategoryModal';
import { apiClientFetch } from '../lib/api-client';
import { useToast } from '../lib/hooks/useToast';
import { useOptionalKb } from '../lib/hooks/useKb';

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  slugPath: string[];
  userRole: Role;
  categories: Category[];
  onMutationSuccess: () => void;
  kbSlug?: string;
}

function TreeItem({
  node,
  depth,
  slugPath,
  userRole,
  categories,
  onMutationSuccess,
  kbSlug,
}: TreeItemProps) {
  const pathname = usePathname();
  const toast = useToast();
  const kb = useOptionalKb();
  const [expanded, setExpanded] = useState(depth > 0);
  const hasChildren = node.children.length > 0;
  const categoryPath = [...slugPath, node.slug];
  const effectiveSlug = kbSlug ?? kb?.slug;
  const href = effectiveSlug
    ? `/kb/${effectiveSlug}/categories/${categoryPath.join('/')}`
    : `/categories/${categoryPath.join('/')}`;
  const isActive = pathname === href;
  const isAdmin = hasMinimumRole(userRole, 'admin');
  const apiBase = kb ? `/api/knowledge-bases/${kb.id}` : '/api';

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClientFetch(`${apiBase}/categories/${node.id}`, {
        method: 'DELETE',
      });
      setDeleteModalOpen(false);
      toast.success('Category deleted');
      onMutationSuccess();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete category'
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li>
      <div
        className={`
          flex items-center gap-1 px-4 py-1.5 ${depth === 0 ? 'text-[15px] font-medium' : 'text-sm'} font-[family-name:var(--font-ui)]
          transition-colors duration-150 cursor-pointer group
          ${isActive ? 'bg-sidebar-hover text-sidebar-text-active' : 'hover:bg-sidebar-hover hover:text-sidebar-text-active'}
        `}
        style={{ paddingLeft: `${depth * 12 + 16}px` }}
      >
        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-4 h-4 flex items-center justify-center text-sidebar-text/40 hover:text-sidebar-text/70 transition-colors shrink-0"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`w-3 h-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!hasChildren && <span className="w-4 shrink-0" />}
        <Link
          href={href}
          className="flex-1 truncate"
        >
          {node.name}
        </Link>
        {isAdmin && (
          <DropdownMenu
            trigger={
              <button
                type="button"
                className="w-5 h-5 flex items-center justify-center text-sidebar-text/0 group-hover:text-sidebar-text/40 hover:!text-sidebar-text/70 transition-colors shrink-0 rounded"
                aria-label={`Actions for ${node.name}`}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
            align="left"
          >
            <DropdownItem onClick={() => setRenameModalOpen(true)}>
              <span className="flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5" />
                Rename
              </span>
            </DropdownItem>
            <DropdownItem
              variant="danger"
              onClick={() => setDeleteModalOpen(true)}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </span>
            </DropdownItem>
          </DropdownMenu>
        )}
      </div>

      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              slugPath={categoryPath}
              userRole={userRole}
              categories={categories}
              onMutationSuccess={onMutationSuccess}
              kbSlug={kbSlug}
            />
          ))}
        </ul>
      )}

      {/* Rename modal */}
      <CategoryModal
        open={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        onSuccess={onMutationSuccess}
        categories={categories}
        category={node}
      />

      {/* Delete confirmation modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteError(null);
        }}
        title="Delete category"
      >
        <p className="text-sm text-ink font-[family-name:var(--font-ui)] mb-4">
          Are you sure you want to delete &ldquo;{node.name}&rdquo;?
          This cannot be undone. Categories with children or articles cannot be
          deleted.
        </p>
        {deleteError && (
          <p className="text-sm text-danger mb-3 font-[family-name:var(--font-ui)]">
            {deleteError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDeleteModalOpen(false);
              setDeleteError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            loading={deleting}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </li>
  );
}

interface SidebarTreeProps {
  categories: Category[];
  userRole: Role;
  kbSlug?: string;
}

export function SidebarTree({ categories, userRole, kbSlug }: SidebarTreeProps) {
  const router = useRouter();
  const tree = buildTree(categories);

  function handleMutationSuccess() {
    router.refresh();
  }

  if (tree.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-sidebar-text/40 font-[family-name:var(--font-ui)] italic">
        No categories yet
      </p>
    );
  }

  return (
    <ul>
      {tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          slugPath={[]}
          userRole={userRole}
          categories={categories}
          onMutationSuccess={handleMutationSuccess}
          kbSlug={kbSlug}
        />
      ))}
    </ul>
  );
}
