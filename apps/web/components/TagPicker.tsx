'use client';

import { useState, useEffect, useRef } from 'react';
import { apiClientFetch } from '../lib/api-client';
import { useOptionalKb } from '../lib/hooks/useKb';
import type { Tag } from '@dovetail/types';

interface TagPickerProps {
  articleId?: string;
  initialTags?: Tag[];
  onTagsChange?: (tags: Tag[]) => void;
}

export function TagPicker({ articleId, initialTags = [], onTagsChange }: TagPickerProps) {
  const kb = useOptionalKb();
  const apiBase = kb ? `/api/knowledge-bases/${kb.id}` : '/api';
  const [assignedTags, setAssignedTags] = useState<Tag[]>(initialTags);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClientFetch<Tag[]>(`${apiBase}/tags`)
      .then(setAllTags)
      .catch(() => {});
  }, [apiBase]);

  useEffect(() => {
    if (articleId) {
      apiClientFetch<Tag[]>(`${apiBase}/articles/${articleId}/tags`)
        .then((tags) => {
          setAssignedTags(tags);
          onTagsChange?.(tags);
        })
        .catch(() => {});
    }
  }, [articleId, apiBase]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const assignedIds = new Set(assignedTags.map((t) => t.id));
  const filtered = allTags.filter(
    (t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(input.toLowerCase()),
  );

  async function handleAdd(tag: Tag) {
    setAssignedTags((prev) => [...prev, tag]);
    onTagsChange?.([...assignedTags, tag]);
    setInput('');
    setOpen(false);

    if (articleId) {
      try {
        await apiClientFetch(`${apiBase}/articles/${articleId}/tags`, {
          method: 'POST',
          body: JSON.stringify({ tagIds: [tag.id] }),
        });
      } catch {
        setAssignedTags((prev) => prev.filter((t) => t.id !== tag.id));
        onTagsChange?.(assignedTags);
      }
    }
  }

  async function handleRemove(tag: Tag) {
    setAssignedTags((prev) => prev.filter((t) => t.id !== tag.id));
    onTagsChange?.(assignedTags.filter((t) => t.id !== tag.id));

    if (articleId) {
      try {
        await apiClientFetch(`${apiBase}/articles/${articleId}/tags/${tag.id}`, {
          method: 'DELETE',
        });
      } catch {
        setAssignedTags((prev) => [...prev, tag]);
        onTagsChange?.([...assignedTags]);
      }
    }
  }

  return (
    <div className="mb-6">
      <label className="block text-xs font-[family-name:var(--font-ui)] text-ink-muted uppercase tracking-widest mb-2">
        Tags
      </label>

      {assignedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {assignedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 text-xs font-[family-name:var(--font-ui)] font-medium px-2 py-1 rounded-full bg-accent/10 text-accent"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => handleRemove(tag)}
                className="hover:text-accent/70 transition-colors"
                aria-label={`Remove tag ${tag.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div ref={wrapperRef} className="relative max-w-md">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Add a tag..."
          className="w-full font-[family-name:var(--font-ui)] text-sm text-ink bg-parchment-warm border border-border-light rounded px-3 py-2 outline-none focus:border-accent transition-colors"
        />
        {open && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-parchment border border-border-light rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => handleAdd(tag)}
                  className="w-full text-left px-3 py-2 text-sm font-[family-name:var(--font-ui)] text-ink hover:bg-parchment-warm transition-colors"
                >
                  {tag.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
