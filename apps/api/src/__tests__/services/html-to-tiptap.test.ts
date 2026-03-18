import { describe, expect, it } from 'vitest';
import { htmlToTiptap } from '../../services/import/html-to-tiptap.js';

describe('htmlToTiptap', () => {
  it('converts a simple paragraph', () => {
    const result = htmlToTiptap('<p>Hello world</p>');
    expect(result.type).toBe('doc');
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('paragraph');
    expect(result.content[0].content[0]).toMatchObject({ type: 'text', text: 'Hello world' });
  });

  it('converts bold and italic marks', () => {
    const result = htmlToTiptap('<p><strong>bold</strong> and <em>italic</em></p>');
    const para = result.content[0];
    const boldNode = para.content.find((n: any) => n.text === 'bold');
    expect(boldNode.marks).toContainEqual({ type: 'bold' });
    const italicNode = para.content.find((n: any) => n.text === 'italic');
    expect(italicNode.marks).toContainEqual({ type: 'italic' });
  });

  it('converts headings with correct level', () => {
    const result = htmlToTiptap('<h2>My Heading</h2>');
    expect(result.content[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
    });
  });

  it('converts links', () => {
    const result = htmlToTiptap('<p><a href="https://example.com">click</a></p>');
    const link = result.content[0].content[0];
    expect(link.marks).toContainEqual(
      expect.objectContaining({ type: 'link', attrs: expect.objectContaining({ href: 'https://example.com' }) }),
    );
  });

  it('converts unordered lists', () => {
    const result = htmlToTiptap('<ul><li>one</li><li>two</li></ul>');
    expect(result.content[0].type).toBe('bulletList');
    expect(result.content[0].content).toHaveLength(2);
    expect(result.content[0].content[0].type).toBe('listItem');
  });

  it('converts ordered lists', () => {
    const result = htmlToTiptap('<ol><li>first</li></ol>');
    expect(result.content[0].type).toBe('orderedList');
  });

  it('converts tables', () => {
    const result = htmlToTiptap('<table><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>');
    expect(result.content[0].type).toBe('table');
  });

  it('converts blockquotes', () => {
    const result = htmlToTiptap('<blockquote><p>Quoted text</p></blockquote>');
    expect(result.content[0].type).toBe('blockquote');
  });

  it('converts horizontal rules', () => {
    const result = htmlToTiptap('<p>Before</p><hr><p>After</p>');
    expect(result.content[1].type).toBe('horizontalRule');
  });

  it('returns an empty doc for empty input', () => {
    const result = htmlToTiptap('');
    expect(result).toEqual({ type: 'doc', content: [] });
  });
});
