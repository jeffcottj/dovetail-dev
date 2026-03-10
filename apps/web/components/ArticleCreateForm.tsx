'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { apiClientFetch } from '../lib/api-client';
import { buildTree, flattenTree } from '../lib/categories';
import { Button } from './ui/Button';
import type { Article, Category } from '@dovetail/types';

interface ArticleCreateFormProps {
  categories: Category[];
  defaultCategoryId?: string;
}

export function ArticleCreateForm({ categories, defaultCategoryId }: ArticleCreateFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? '');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const tree = buildTree(categories);
    return flattenTree(tree);
  }, [categories]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose-article',
      },
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor || !title.trim() || !categoryId) return;
    setSaving(true);
    setStatus(null);
    try {
      const created = await apiClientFetch<Article>('/api/articles', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          categoryId,
          content: editor.getJSON(),
        }),
      });
      setStatus('Saved');
      setTimeout(() => {
        router.push(`/articles/${created.slug}`);
      }, 500);
    } catch {
      setStatus('Save failed');
    } finally {
      setSaving(false);
    }
  }, [editor, title, categoryId, router]);

  const handlePublish = useCallback(async () => {
    if (!editor || !title.trim() || !categoryId) return;
    setPublishing(true);
    setStatus(null);
    try {
      // Create the article as draft first
      const created = await apiClientFetch<Article>('/api/articles', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          categoryId,
          content: editor.getJSON(),
        }),
      });
      // Then publish it
      await apiClientFetch(`/api/articles/${created.id}/publish`, {
        method: 'POST',
      });
      setStatus('Published');
      setTimeout(() => {
        router.push(`/articles/${created.slug}`);
      }, 500);
    } catch {
      setStatus('Publish failed');
    } finally {
      setPublishing(false);
    }
  }, [editor, title, categoryId, router]);

  const busy = saving || publishing;
  const canSubmit = title.trim().length > 0 && categoryId.length > 0 && !busy;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-border-light">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={handleSave}
            disabled={!canSubmit}
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handlePublish}
            disabled={!canSubmit}
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </Button>
          {status && (
            <span className={`text-xs font-[family-name:var(--font-ui)] ${status.includes('failed') ? 'text-danger' : 'text-success'}`}>
              {status}
            </span>
          )}
        </div>
        <button
          onClick={() => router.back()}
          className="font-[family-name:var(--font-ui)] text-sm text-ink-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Article title"
        aria-label="Article title"
        className="w-full font-[family-name:var(--font-display)] text-3xl font-bold text-ink bg-transparent border-none outline-none placeholder:text-border mb-6 tracking-tight"
      />

      {/* Category selector */}
      <div className="mb-6">
        <label
          htmlFor="category-select"
          className="block text-xs font-[family-name:var(--font-ui)] text-ink-muted uppercase tracking-widest mb-2"
        >
          Category
        </label>
        <select
          id="category-select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full max-w-md font-[family-name:var(--font-ui)] text-sm text-ink bg-white/50 border border-border-light rounded px-3 py-2 outline-none focus:border-accent transition-colors"
        >
          <option value="">Select a category...</option>
          {categoryOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {'\u00A0\u00A0'.repeat(opt.depth)}{opt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Editor */}
      <div className="tiptap-content bg-white/50 rounded-lg border border-border-light p-6 min-h-[400px]">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-parchment-warm rounded w-full" />
            <div className="h-4 bg-parchment-warm rounded w-5/6" />
          </div>
        )}
      </div>
    </div>
  );
}
