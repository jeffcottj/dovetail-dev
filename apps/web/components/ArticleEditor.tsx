'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import { EditorToolbar } from './EditorToolbar';
import { apiClientFetch } from '../lib/api-client';
import { useToast } from '../lib/hooks/useToast';
import { useOptionalKb } from '../lib/hooks/useKb';
import { articleEditorExtensions } from '../lib/editor/extensions';
import { Button } from './ui/Button';
import { TagPicker } from './TagPicker';
import { AttachmentManager } from './AttachmentManager';
import { DocxImportControl } from './DocxImportControl';
import { articleUrl } from '../lib/article-url';
import type { Article, DocxConversionResult } from '@dovetail/types';

export function ArticleEditor({ article }: { article: Article }) {
  const router = useRouter();
  const toast = useToast();
  const kb = useOptionalKb();
  const apiBase = kb ? `/api/knowledge-bases/${kb.id}` : '/api';
  const [title, setTitle] = useState(article.title);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [attachmentRefreshKey, setAttachmentRefreshKey] = useState(0);

  const editor = useEditor({
    extensions: articleEditorExtensions(),
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
      await apiClientFetch(`${apiBase}/articles/${article.id}`, {
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
  }, [editor, article.id, title, toast, apiBase]);

  const handlePublish = useCallback(async () => {
    if (!editor) return;
    setPublishing(true);
    try {
      // Save first
      await apiClientFetch(`${apiBase}/articles/${article.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: editor.getJSON(),
        }),
      });
      // Then publish
      await apiClientFetch(`${apiBase}/articles/${article.id}/publish`, {
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
  }, [editor, article.id, article.slug, title, router, toast, apiBase]);

  const uploadRetainedDocx = useCallback(async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`${apiBase}/articles/${article.id}/attachments`, {
      method: 'POST',
      credentials: 'include',
      body,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    setAttachmentRefreshKey((key) => key + 1);
  }, [apiBase, article.id]);

  const handleDocxConverted = useCallback(async (result: DocxConversionResult, file: File, retainOriginal: boolean) => {
    if (!editor) return false;
    if (editor.getText().trim() && !window.confirm('Replace the current article content with the converted document?')) {
      return false;
    }
    editor.commands.setContent(result.content);
    if (retainOriginal) {
      try {
        await uploadRetainedDocx(file);
      } catch {
        toast.error('Content converted, but the original Word document was not attached');
      }
    }
    return true;
  }, [editor, toast, uploadRetainedDocx]);

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

      <DocxImportControl
        apiBase={apiBase}
        articleId={article.id}
        disabled={saving || publishing}
        onConverted={handleDocxConverted}
      />

      {/* Editor */}
      {editor && <EditorToolbar editor={editor} />}
      <div className="tiptap-content bg-parchment-warm rounded-lg border border-border-light rounded-t-none p-6 min-h-[400px]">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-parchment-warm rounded w-full" />
            <div className="h-4 bg-parchment-warm rounded w-5/6" />
          </div>
        )}
      </div>

      <AttachmentManager articleId={article.id} refreshKey={attachmentRefreshKey} />
    </div>
  );
}
