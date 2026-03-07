import { describe, expect, it } from 'vitest';
import { extractText } from '../../utils/tiptap.js';

describe('extractText', () => {
  it('extracts text from a simple Tiptap document', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'text', text: ' world' },
          ],
        },
      ],
    };
    expect(extractText(doc)).toBe('Hello  world');
  });

  it('extracts text from nested headings and paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Body text here.' }],
        },
      ],
    };
    expect(extractText(doc)).toBe('Title Body text here.');
  });

  it('returns empty string for null/undefined', () => {
    expect(extractText(null)).toBe('');
    expect(extractText(undefined)).toBe('');
  });

  it('returns empty string for empty doc', () => {
    expect(extractText({ type: 'doc', content: [] })).toBe('');
  });
});
