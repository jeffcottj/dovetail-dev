# Editor Toolbar & Hyperlink Styling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a formatting toolbar to the TipTap editor and make hyperlinks visually distinct in both the editor and article viewer.

**Architecture:** A shared `EditorToolbar` React component receives the TipTap `editor` instance as a prop and renders icon buttons that call editor chain commands. Link and image insert use small popover inputs. Hyperlink styles are applied globally via `.tiptap-content .ProseMirror a` CSS rules.

**Tech Stack:** TipTap (React), `@tiptap/extension-link`, `lucide-react`, Tailwind CSS

---

### Task 1: Install `@tiptap/extension-link`

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Install the package**

Run: `pnpm --filter @dovetail/web add @tiptap/extension-link`

**Step 2: Verify installation**

Run: `grep "@tiptap/extension-link" apps/web/package.json`
Expected: A line with `"@tiptap/extension-link"` and a version

**Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add @tiptap/extension-link dependency"
```

---

### Task 2: Add hyperlink CSS styles

**Files:**
- Modify: `apps/web/app/globals.css` (after the existing `.tiptap-content .ProseMirror hr` block, around line 192)

**Step 1: Add link styles**

Add these rules after the existing `.tiptap-content .ProseMirror hr` rule block:

```css
.tiptap-content .ProseMirror a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: var(--color-accent-light);
  transition: color 0.15s ease;
  cursor: pointer;
}

.tiptap-content .ProseMirror a:hover {
  color: var(--color-accent-light);
}
```

**Step 2: Verify visually**

Run: `pnpm dev` and navigate to an article that contains links (or create test content with a link). Links should be blue/underlined.

**Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style: add hyperlink styling for TipTap content"
```

---

### Task 3: Add Link extension to `ArticleContent` (read-only viewer)

**Files:**
- Modify: `apps/web/components/ArticleContent.tsx`

**Step 1: Add Link import and extension**

Add import at top:
```tsx
import Link from '@tiptap/extension-link';
```

Update the `extensions` array in `useEditor` to include Link:
```tsx
extensions: [
  StarterKit,
  Image,
  Link.configure({ openOnClick: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
],
```

`openOnClick: true` makes links clickable in the read-only viewer.

**Step 2: Verify**

View an article with link content. Links should render as styled `<a>` tags and be clickable.

**Step 3: Commit**

```bash
git add apps/web/components/ArticleContent.tsx
git commit -m "feat: add Link extension to article content viewer"
```

---

### Task 4: Create the `EditorToolbar` component

**Files:**
- Create: `apps/web/components/EditorToolbar.tsx`

**Step 1: Create the toolbar component**

Create `apps/web/components/EditorToolbar.tsx` with the following structure:

```tsx
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
  CodeSquare,
  Minus,
  Link,
  ImageIcon,
} from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor;
}

/* ── tiny popover for link / image URL entry ── */

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

/* ── single toolbar button ── */

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

/* ── divider between groups ── */

function Divider() {
  return <div className="w-px h-5 bg-border-light mx-1" />;
}

/* ── main toolbar ── */

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
        <CodeSquare size={iconSize} />
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
```

**Step 2: Verify it compiles**

Run: `pnpm --filter @dovetail/web build`
Expected: Build succeeds (component not used yet but should compile)

**Step 3: Commit**

```bash
git add apps/web/components/EditorToolbar.tsx
git commit -m "feat: add EditorToolbar component with formatting buttons"
```

---

### Task 5: Integrate toolbar into `ArticleEditor`

**Files:**
- Modify: `apps/web/components/ArticleEditor.tsx`

**Step 1: Add Link import and update extensions**

Add imports at top:
```tsx
import Link from '@tiptap/extension-link';
import { EditorToolbar } from './EditorToolbar';
```

Update the `extensions` array:
```tsx
extensions: [
  StarterKit,
  Image,
  Link.configure({ openOnClick: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
],
```

`openOnClick: false` because in the editor you don't want clicking a link to navigate away.

**Step 2: Add toolbar to the JSX**

Replace the editor container `<div>` (the one with `tiptap-content` class) with:

```tsx
{/* Editor */}
{editor && <EditorToolbar editor={editor} />}
<div className="tiptap-content bg-parchment-warm rounded-lg border border-border-light rounded-t-none p-6 min-h-[400px]">
```

Note: `rounded-t-none` removes top border radius so the toolbar and editor box connect seamlessly. The toolbar already has `rounded-t-lg` and `border-b-0`.

**Step 3: Verify**

Run: `pnpm dev`, navigate to edit an article. Toolbar should appear above the editor. Click Bold, type text — it should be bold. Click link button, enter a URL — selected text should become a link.

**Step 4: Commit**

```bash
git add apps/web/components/ArticleEditor.tsx
git commit -m "feat: integrate formatting toolbar into ArticleEditor"
```

---

### Task 6: Integrate toolbar into `ArticleCreateForm`

**Files:**
- Modify: `apps/web/components/ArticleCreateForm.tsx`

**Step 1: Add Link, Image imports and update extensions**

Add imports:
```tsx
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { EditorToolbar } from './EditorToolbar';
```

Update the `extensions` array (currently only has `StarterKit`):
```tsx
extensions: [StarterKit, Image, Link.configure({ openOnClick: false })],
```

**Step 2: Add toolbar to the JSX**

Same pattern as ArticleEditor — add `{editor && <EditorToolbar editor={editor} />}` before the editor div, and add `rounded-t-none` to the editor div:

```tsx
{/* Editor */}
{editor && <EditorToolbar editor={editor} />}
<div className="tiptap-content bg-parchment-warm rounded-lg border border-border-light rounded-t-none p-6 min-h-[400px]">
```

**Step 3: Verify**

Run: `pnpm dev`, navigate to create a new article. Toolbar should appear and all buttons should function.

**Step 4: Commit**

```bash
git add apps/web/components/ArticleCreateForm.tsx
git commit -m "feat: integrate formatting toolbar into ArticleCreateForm"
```

---

### Task 7: Verify everything builds and works end-to-end

**Step 1: Run full build**

Run: `pnpm build`
Expected: All packages and apps build successfully

**Step 2: Manual E2E verification**

Run: `pnpm dev` and check:
- [ ] ArticleEditor: toolbar visible, all buttons work, link popover works, image insert works
- [ ] ArticleCreateForm: toolbar visible, all buttons work
- [ ] ArticleContent (viewer): links are styled blue/underlined, links are clickable
- [ ] Dark mode: link colors use the dark mode accent color

**Step 3: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address toolbar integration fixups"
```
