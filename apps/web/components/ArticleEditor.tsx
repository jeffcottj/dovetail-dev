'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { apiClientFetch } from '../lib/api-client';
import { useToast } from '../lib/hooks/useToast';
import { Button } from './ui/Button';
import { TagPicker } from './TagPicker';
import { articleUrl } from '../lib/article-url';
import type { Article } from '@dovetail/types';

export function ArticleEditor({ article }: { article: Article }) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(article.title);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

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
    try {
      await apiClientFetch(`/api/articles/${article.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: editor.getJSON(),
        }),
      });
      toast.success('Draft saved');
    } catch (err) {
      toast.error('Failed to save draft');
    } finally {
      setSaving(false);
    }
  }, [editor, article.id, title, toast]);

  const handlePublish = useCallback(async () => {
    if (!editor) return;
    setPublishing(true);
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
      toast.success('Article published');
      setTimeout(() => {
        router.push(articleUrl(article));
      }, 500);
    } catch (err) {
      toast.error('Failed to publish article');
    } finally {
      setPublishing(false);
    }
  }, [editor, article.id, article.slug, title, router, toast]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-border-light">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleSave}
            loading={saving}
          >
            Save draft
          </Button>
          <Button
            onClick={handlePublish}
            loading={publishing}
          >
            Publish
          </Button>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
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
