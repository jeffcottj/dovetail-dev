'use client';

import { useState } from 'react';

interface CategoryNode {
  sourceId: string;
  name: string;
  children: CategoryNode[];
  articleCount: number;
}

interface CategoryTreePreviewProps {
  tree: CategoryNode[];
}

function TreeNode({ node, depth = 0 }: { node: CategoryNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-parchment-warm/50 cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span className="text-xs text-ink-muted w-4">
            {expanded ? '\u25BE' : '\u25B8'}
          </span>
        )}
        {!hasChildren && <span className="w-4" />}
        <span className="text-sm font-[family-name:var(--font-ui)]">{node.name}</span>
        <span className="text-xs text-ink-muted ml-auto">
          {node.articleCount} {node.articleCount === 1 ? 'article' : 'articles'}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.sourceId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTreePreview({ tree }: CategoryTreePreviewProps) {
  return (
    <div className="border border-border-light rounded-lg p-3 max-h-80 overflow-y-auto">
      {tree.map((node) => (
        <TreeNode key={node.sourceId} node={node} />
      ))}
    </div>
  );
}
