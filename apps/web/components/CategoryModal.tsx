'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { apiClientFetch } from '../lib/api-client';
import { buildTree, flattenTree } from '../lib/categories';
import type { Category } from '@dovetail/types';

interface CategoryModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  /** When provided, the modal is in "edit/rename" mode for this category */
  category?: Category;
  /** When provided, pre-selects this parent for a new subcategory */
  parentId?: string | null;
}

export function CategoryModal({
  open,
  onClose,
  onSuccess,
  categories,
  category,
  parentId,
}: CategoryModalProps) {
  const isEditing = !!category;

  const [name, setName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form state when the modal opens or the category changes
  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setSelectedParentId(parentId ?? category?.parentId ?? null);
      setError(null);
      setSubmitting(false);
    }
  }, [open, category, parentId]);

  const parentOptions = useMemo(() => {
    const tree = buildTree(categories);
    const flatOptions = flattenTree(tree);

    if (!category) return flatOptions;

    // Exclude the category itself and its descendants to prevent circular references
    const excludeIds = new Set<string>();
    function collectDescendants(id: string) {
      excludeIds.add(id);
      for (const cat of categories) {
        if (cat.parentId === id) {
          collectDescendants(cat.id);
        }
      }
    }
    collectDescendants(category.id);

    return flatOptions.filter((opt) => !excludeIds.has(opt.id));
  }, [categories, category]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        await apiClientFetch(`/api/categories/${category.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed }),
        });
      } else {
        await apiClientFetch('/api/categories', {
          method: 'POST',
          body: JSON.stringify({
            name: trimmed,
            ...(selectedParentId ? { parentId: selectedParentId } : {}),
          }),
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Rename Category' : 'New Category'}
    >
      <form onSubmit={handleSubmit}>
        <label className="block mb-4">
          <span className="block text-sm font-[family-name:var(--font-ui)] text-ink-muted mb-1">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            autoFocus
            className="w-full px-3 py-2 border border-border-light rounded-lg text-sm font-[family-name:var(--font-ui)] text-ink bg-parchment focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </label>

        {!isEditing && (
          <label className="block mb-4">
            <span className="block text-sm font-[family-name:var(--font-ui)] text-ink-muted mb-1">
              Parent category
              <span className="text-ink-muted/60 ml-1">(optional)</span>
            </span>
            <select
              value={selectedParentId ?? ''}
              onChange={(e) =>
                setSelectedParentId(e.target.value || null)
              }
              className="w-full px-3 py-2 border border-border-light rounded-lg text-sm font-[family-name:var(--font-ui)] text-ink bg-parchment focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            >
              <option value="">None (root category)</option>
              {parentOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {'\u00A0\u00A0'.repeat(opt.depth)}
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <p className="text-sm text-danger mb-3 font-[family-name:var(--font-ui)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={submitting || !name.trim()}
          >
            {submitting
              ? isEditing
                ? 'Renaming...'
                : 'Creating...'
              : isEditing
                ? 'Rename'
                : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
