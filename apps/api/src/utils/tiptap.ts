/**
 * Recursively extracts plain text from Tiptap JSON content.
 * Walks the node tree and concatenates all text node values.
 */
export function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;

  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text;
  }

  if (Array.isArray(n.content)) {
    return n.content.map(extractText).join(' ');
  }

  return '';
}
