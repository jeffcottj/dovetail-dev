'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, FolderInput, Archive } from 'lucide-react';
import { DropdownMenu, DropdownItem } from './ui/DropdownMenu';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { apiClientFetch } from '../lib/api-client';
import { buildTree, type TreeNode } from '../lib/categories';
import type { Article, Category } from '@dovetail/types';

function CategoryTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`w-full text-left flex items-center gap-1 px-3 py-1.5 text-sm font-[family-name:var(--font-ui)] transition-colors rounded ${
          isSelected
            ? 'bg-accent/10 text-accent font-medium'
            : 'text-ink hover:bg-parchment-warm'
        }`}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {hasChildren && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                setExpanded(!expanded);
              }
            }}
            className="w-4 h-4 flex items-center justify-center text-ink-muted hover:text-ink transition-colors shrink-0"
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
          </span>
        )}
        {!hasChildren && <span className="w-4 shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <CategoryTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface ArticleActionsProps {
  article: Article;
  categories: Category[];
}

export function ArticleActions({ article, categories }: ArticleActionsProps) {
  const router = useRouter();
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    article.categoryId
  );
  const [moving, setMoving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = buildTree(categories);

  async function handleMove() {
    if (!selectedCategoryId || selectedCategoryId === article.categoryId) return;
    setMoving(true);
    setError(null);
    try {
      await apiClientFetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ categoryId: selectedCategoryId }),
      });
      setMoveModalOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move article');
    } finally {
      setMoving(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    setError(null);
    try {
      await apiClientFetch(`/api/articles/${article.id}`, {
        method: 'DELETE',
      });
      setArchiveModalOpen(false);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive article');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Link
        href={`/articles/${article.slug}/edit`}
        className="inline-flex items-center gap-1.5 font-[family-name:var(--font-ui)] text-sm px-4 py-2 bg-accent text-parchment rounded hover:bg-accent-hover transition-colors font-medium"
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit
      </Link>

      <DropdownMenu
        trigger={
          <button
            type="button"
            className="inline-flex items-center justify-center w-9 h-9 rounded border border-border-light text-ink-muted hover:text-ink hover:border-border transition-colors"
            aria-label="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        }
        align="right"
      >
        <DropdownItem onClick={() => setMoveModalOpen(true)}>
          <span className="flex items-center gap-2">
            <FolderInput className="w-4 h-4" />
            Move to category...
          </span>
        </DropdownItem>
        <DropdownItem variant="danger" onClick={() => setArchiveModalOpen(true)}>
          <span className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Archive
          </span>
        </DropdownItem>
      </DropdownMenu>

      <Modal
        open={moveModalOpen}
        onClose={() => {
          setMoveModalOpen(false);
          setError(null);
          setSelectedCategoryId(article.categoryId);
        }}
        title="Move to category"
      >
        <p className="text-sm text-ink-muted font-[family-name:var(--font-ui)] mb-3">
          Select the category to move &ldquo;{article.title}&rdquo; into:
        </p>
        <div className="max-h-64 overflow-y-auto border border-border-light rounded-lg py-1 mb-4">
          {tree.length > 0 ? (
            <ul>
              {tree.map((node) => (
                <CategoryTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedCategoryId}
                  onSelect={setSelectedCategoryId}
                />
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-ink-muted italic">
              No categories available
            </p>
          )}
        </div>
        {error && (
          <p className="text-sm text-danger mb-3 font-[family-name:var(--font-ui)]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setMoveModalOpen(false);
              setError(null);
              setSelectedCategoryId(article.categoryId);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleMove}
            disabled={
              moving ||
              !selectedCategoryId ||
              selectedCategoryId === article.categoryId
            }
          >
            {moving ? 'Moving...' : 'Move'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={archiveModalOpen}
        onClose={() => {
          setArchiveModalOpen(false);
          setError(null);
        }}
        title="Archive article"
      >
        <p className="text-sm text-ink font-[family-name:var(--font-ui)] mb-4">
          Are you sure? This will archive the article &ldquo;{article.title}&rdquo;.
          It will no longer appear in search results or category listings.
        </p>
        {error && (
          <p className="text-sm text-danger mb-3 font-[family-name:var(--font-ui)]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setArchiveModalOpen(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleArchive}
            disabled={archiving}
          >
            {archiving ? 'Archiving...' : 'Archive'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
