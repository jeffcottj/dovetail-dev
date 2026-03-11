'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { apiClientFetch } from '../lib/api-client';
import { TagPicker } from './TagPicker';
import type { Article } from '@dovetail/types';

export function ArticleEditor({ article }: { article: Article }) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: article.content as Parameters<typeof useEditor>[0] extends { content?: infer C } ? C : never,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose-article',
      },
    },
  });

  const handleSave = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    setStatus(null);
    try {
      await apiClientFetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: editor.getJSON(),
        }),
      });
      setStatus('Saved');
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus('Save failed');
    } finally {
      setSaving(false);
    }
  }, [editor, article.id, title]);

  const handlePublish = useCallback(async () => {
    if (!editor) return;
    setPublishing(true);
    setStatus(null);
    try {
      // Save first
      await apiClientFetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: editor.getJSON(),
        }),
      });
      // Then publish
      await apiClientFetch(`/api/articles/${article.id}/publish`, {
        method: 'POST',
      });
      setStatus('Published');
      setTimeout(() => {
        router.push(`/articles/${article.slug}`);
      }, 500);
    } catch (err) {
      setStatus('Publish failed');
    } finally {
      setPublishing(false);
    }
  }, [editor, article.id, article.slug, title, router]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-border-light">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="font-[family-name:var(--font-ui)] text-sm px-4 py-2 bg-ink text-parchment rounded hover:bg-ink-light transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save draft'}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="font-[family-name:var(--font-ui)] text-sm px-4 py-2 bg-accent text-parchment rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
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
        className="w-full font-[family-name:var(--font-display)] text-3xl font-bold text-ink bg-transparent border-none outline-none placeholder:text-border mb-6 tracking-tight"
      />

      {/* Tags */}
      <TagPicker articleId={article.id} />

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
