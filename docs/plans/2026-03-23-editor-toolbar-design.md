# Editor Toolbar & Hyperlink Styling Design

## Problem

The TipTap editor supports formatting via keyboard shortcuts (e.g. Ctrl+B) but has no UI controls for formatting. Hyperlinks are not supported (no Link extension) and have no visual styling in either the editor or the article viewer.

## Solution

### 1. Formatting Toolbar

A shared `EditorToolbar` component rendered above the editor content area. Receives the TipTap `editor` instance as a prop. Used by both `ArticleEditor` and `ArticleCreateForm`.

**Toolbar buttons (grouped with visual dividers):**

| Group | Actions |
|-------|---------|
| Text marks | Bold, Italic, Strikethrough, Code (inline) |
| Block types | Heading dropdown (H1/H2/H3), Bullet list, Ordered list, Blockquote, Code block, Horizontal rule |
| Insert | Link (URL popover), Image (URL popover) |

**Behavior:**
- Toggle buttons show active/pressed state when cursor is inside formatted text
- Buttons call `editor.chain().focus().toggle*().run()` style TipTap commands
- Link button opens a small popover with URL input + apply/remove actions
- Image button opens a small popover with URL input + insert action
- Icons sourced from `lucide-react` (already installed)

### 2. Hyperlink Styling

CSS rules for `a` tags inside `.tiptap-content .ProseMirror`:
- Color: `var(--color-accent)`
- `text-decoration: underline` with `text-underline-offset: 2px`
- Hover: `var(--color-accent-light)`
- Editor-only: subtle background highlight on links for visibility while editing

Applies to both the editor and the read-only `ArticleContent` viewer via the shared `.tiptap-content` class.

### 3. New Dependencies

- `@tiptap/extension-link` — link support for TipTap

No other new packages. `lucide-react`, `@tiptap/extension-image`, and `@tiptap/starter-kit` are already present.

### 4. Files Changed

- `apps/web/components/EditorToolbar.tsx` — new shared toolbar component
- `apps/web/components/ArticleEditor.tsx` — add Link extension, add toolbar
- `apps/web/components/ArticleCreateForm.tsx` — add Link + Image extensions, add toolbar
- `apps/web/components/ArticleContent.tsx` — add Link extension
- `apps/web/app/globals.css` — add link styles
- `apps/web/package.json` — add `@tiptap/extension-link`
