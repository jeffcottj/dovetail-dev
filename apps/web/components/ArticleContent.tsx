'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export function ArticleContent({ content }: { content: unknown }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content as Parameters<typeof useEditor>[0] extends { content?: infer C } ? C : never,
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose-article',
      },
    },
  });

  if (!editor) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-parchment-warm rounded w-full" />
        <div className="h-4 bg-parchment-warm rounded w-5/6" />
        <div className="h-4 bg-parchment-warm rounded w-4/6" />
      </div>
    );
  }

  return (
    <div className="tiptap-content">
      <EditorContent editor={editor} />
    </div>
  );
}
