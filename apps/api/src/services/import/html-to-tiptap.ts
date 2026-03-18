import { parseHTML } from 'linkedom';
import { Schema, DOMParser as ProseDOMParser } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

// Build a TipTap-compatible ProseMirror schema
const nodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');

// Add table nodes
const withTables = nodes
  .append({
    table: {
      content: 'tableRow+',
      tableRole: 'table',
      group: 'block',
      parseDOM: [{ tag: 'table' }],
      toDOM() { return ['table', ['tbody', 0]]; },
    },
    tableRow: {
      content: '(tableCell | tableHeader)+',
      tableRole: 'row',
      parseDOM: [{ tag: 'tr' }],
      toDOM() { return ['tr', 0]; },
    },
    tableCell: {
      content: 'inline*',
      tableRole: 'cell',
      parseDOM: [{ tag: 'td' }],
      toDOM() { return ['td', 0]; },
    },
    tableHeader: {
      content: 'inline*',
      tableRole: 'header_cell',
      parseDOM: [{ tag: 'th' }],
      toDOM() { return ['th', 0]; },
    },
  });

// Add link mark
const marks = basicSchema.spec.marks.append({
  link: {
    attrs: { href: { default: null }, target: { default: '_blank' } },
    inclusive: false,
    parseDOM: [{
      tag: 'a[href]',
      getAttrs(dom: any) {
        return { href: dom.getAttribute('href'), target: dom.getAttribute('target') || '_blank' };
      },
    }],
    toDOM(mark: any) { return ['a', { href: mark.attrs.href, target: mark.attrs.target }, 0]; },
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() { return ['u', 0]; },
  },
});

const tiptapSchema = new Schema({ nodes: withTables, marks });

/**
 * Convert an HTML string to TipTap-compatible JSON.
 * Uses ProseMirror's DOMParser with linkedom for server-side DOM.
 */
export function htmlToTiptap(html: string): any {
  if (!html.trim()) {
    return { type: 'doc', content: [] };
  }

  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const body = document.querySelector('body')!;
  const doc = ProseDOMParser.fromSchema(tiptapSchema).parse(body);
  return docToJSON(doc);
}

/** Recursively convert a ProseMirror Node to TipTap JSON. */
function docToJSON(node: any): any {
  const result: any = { type: tiptapTypeName(node.type.name) };

  // Attrs (only include non-default)
  if (node.attrs && Object.keys(node.attrs).length > 0) {
    const attrs: Record<string, any> = {};
    for (const [key, value] of Object.entries(node.attrs)) {
      const defaultVal = node.type.attrs[key]?.default;
      if (value !== defaultVal) {
        attrs[key] = value;
      }
    }
    if (Object.keys(attrs).length > 0) {
      result.attrs = attrs;
    }
  }

  // Marks
  if (node.marks && node.marks.length > 0) {
    result.marks = node.marks.map((mark: any) => {
      const m: any = { type: tiptapTypeName(mark.type.name) };
      if (mark.attrs && Object.keys(mark.attrs).length > 0) {
        const attrs: Record<string, any> = {};
        for (const [key, value] of Object.entries(mark.attrs)) {
          const defaultVal = mark.type.attrs[key]?.default;
          if (value !== defaultVal) {
            attrs[key] = value;
          }
        }
        if (Object.keys(attrs).length > 0) {
          m.attrs = attrs;
        }
      }
      return m;
    });
  }

  // Text content
  if (node.isText) {
    result.text = node.text;
  }

  // Children
  if (node.content && node.content.size > 0) {
    result.content = [];
    node.content.forEach((child: any) => {
      result.content.push(docToJSON(child));
    });
  }

  return result;
}

/** Map ProseMirror node type names to TipTap conventions. */
function tiptapTypeName(name: string): string {
  const map: Record<string, string> = {
    bullet_list: 'bulletList',
    ordered_list: 'orderedList',
    list_item: 'listItem',
    hard_break: 'hardBreak',
    horizontal_rule: 'horizontalRule',
    code_block: 'codeBlock',
    strong: 'bold',
    em: 'italic',
    table_row: 'tableRow',
    table_cell: 'tableCell',
    table_header: 'tableHeader',
  };
  return map[name] ?? name;
}
