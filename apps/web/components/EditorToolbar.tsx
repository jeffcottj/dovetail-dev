'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Minus,
  Link,
  ImageIcon,
} from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor;
}

function UrlPopover({
  label,
  onSubmit,
  onClose,
}: {
  label: string;
  onSubmit: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="absolute top-full left-0 mt-1 z-50 flex items-center gap-2 bg-parchment border border-border-light rounded-lg shadow-lg p-2">
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && url.trim()) {
            e.preventDefault();
            onSubmit(url.trim());
          }
          if (e.key === 'Escape') onClose();
        }}
        placeholder={label}
        className="text-sm font-[family-name:var(--font-ui)] border border-border-light rounded px-2 py-1 bg-parchment-warm text-ink outline-none focus:border-accent w-64"
      />
      <button
        type="button"
        onClick={() => url.trim() && onSubmit(url.trim())}
        className="text-xs font-[family-name:var(--font-ui)] font-medium px-2 py-1 rounded bg-accent text-parchment hover:bg-accent-hover transition-colors"
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onClose}
        className="text-xs font-[family-name:var(--font-ui)] text-ink-muted hover:text-ink transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-accent/10 text-accent'
          : 'text-ink-muted hover:text-ink hover:bg-parchment-dark'
      } disabled:opacity-30 disabled:pointer-events-none`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border-light mx-1" />;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const [showImagePopover, setShowImagePopover] = useState(false);
  const linkWrapperRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const iconSize = 18;

  const handleSetLink = useCallback(
    (url: string) => {
      editor.chain().focus().setLink({ href: url }).run();
      setShowLinkPopover(false);
    },
    [editor],
  );

  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    setShowLinkPopover(false);
  }, [editor]);

  const handleInsertImage = useCallback(
    (url: string) => {
      editor.chain().focus().setImage({ src: url }).run();
      setShowImagePopover(false);
    },
    [editor],
  );

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-3 py-2 bg-parchment-warm border border-border-light rounded-t-lg border-b-0">
      {/* Text marks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <Bold size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <Italic size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough (Ctrl+Shift+X)"
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title="Inline code (Ctrl+E)"
      >
        <Code size={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* Lists & blocks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet list"
      >
        <List size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Ordered list"
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Blockquote"
      >
        <Quote size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code block"
      >
        <SquareCode size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <Minus size={iconSize} />
      </ToolbarButton>

      <Divider />

      {/* Link */}
      <div className="relative" ref={linkWrapperRef}>
        <ToolbarButton
          onClick={() => {
            if (editor.isActive('link')) {
              handleRemoveLink();
            } else {
              setShowImagePopover(false);
              setShowLinkPopover((v) => !v);
            }
          }}
          active={editor.isActive('link')}
          title={editor.isActive('link') ? 'Remove link' : 'Add link'}
        >
          <Link size={iconSize} />
        </ToolbarButton>
        {showLinkPopover && (
          <UrlPopover
            label="Enter URL..."
            onSubmit={handleSetLink}
            onClose={() => setShowLinkPopover(false)}
          />
        )}
      </div>

      {/* Image */}
      <div className="relative" ref={imageWrapperRef}>
        <ToolbarButton
          onClick={() => {
            setShowLinkPopover(false);
            setShowImagePopover((v) => !v);
          }}
          title="Insert image"
        >
          <ImageIcon size={iconSize} />
        </ToolbarButton>
        {showImagePopover && (
          <UrlPopover
            label="Image URL..."
            onSubmit={handleInsertImage}
            onClose={() => setShowImagePopover(false)}
          />
        )}
      </div>
    </div>
  );
}
