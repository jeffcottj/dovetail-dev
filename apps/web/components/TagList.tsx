'use client';

import { useState } from 'react';
import { apiClientFetch } from '../lib/api-client';
import { useOptionalKb } from '../lib/hooks/useKb';
import { useToast } from '../lib/hooks/useToast';
import { Button } from './ui/Button';
import type { Tag } from '@dovetail/types';

export function TagList({ initialTags }: { initialTags: Tag[] }) {
  const kb = useOptionalKb();
  const apiBase = kb ? `/api/knowledge-bases/${kb.id}` : '/api';
  const [tags, setTags] = useState(initialTags);
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setCreating(true);
    try {
      const created = await apiClientFetch<Tag>(`${apiBase}/tags`, {
        method: 'POST',
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      setTags((prev) => [...prev, created]);
      setNewTagName('');
      toast.success('Tag created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await apiClientFetch(`${apiBase}/tags/${id}`, { method: 'DELETE' });
      setTags((prev) => prev.filter((t) => t.id !== id));
      toast.success('Tag deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete tag');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreate} className="flex gap-3 items-end">
        <div className="flex-1">
          <label htmlFor="tag-name" className="block text-xs font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted font-semibold mb-1">
            Tag name
          </label>
          <input
            id="tag-name"
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="e.g., Eviction Defense"
            className="w-full border border-border rounded px-3 py-2 text-sm bg-parchment font-[family-name:var(--font-ui)]"
          />
        </div>
        <Button type="submit" loading={creating} disabled={!newTagName.trim()}>
          Create Tag
        </Button>
      </form>

      <div className="border border-border-light rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-parchment-warm border-b border-border-light">
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Name
              </th>
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Slug
              </th>
              <th className="text-right px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id} className="border-b border-border-light last:border-0">
                <td className="px-4 py-3 text-sm text-ink">{tag.name}</td>
                <td className="px-4 py-3 text-sm text-ink-light font-[family-name:var(--font-mono)]">
                  {tag.slug}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(tag.id)}
                    disabled={deleting === tag.id}
                    className="text-xs text-danger hover:text-danger/80 font-[family-name:var(--font-ui)] font-medium disabled:opacity-50"
                  >
                    {deleting === tag.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
            {tags.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-ink-muted text-sm">
                  No tags created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
