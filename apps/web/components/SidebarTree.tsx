'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Category } from '@dovetail/types';
import { buildTree, type TreeNode } from '../lib/categories';

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = pathname === `/categories/${node.slug}`;

  return (
    <li>
      <div
        className={`
          flex items-center gap-1 px-4 py-1.5 text-sm font-[family-name:var(--font-ui)]
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
          href={`/categories/${node.slug}`}
          className="flex-1 truncate"
        >
          {node.name}
        </Link>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarTree({ categories }: { categories: Category[] }) {
  const tree = buildTree(categories);

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
        <TreeItem key={node.id} node={node} depth={0} />
      ))}
    </ul>
  );
}
