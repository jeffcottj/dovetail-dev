import { describe, expect, it } from 'vitest';
import { extractArticleBody, extractDateModified } from '../../services/import/html-extractor.js';

const sampleHtml = `
<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
<article class="kb-article" itemscope itemtype="https://schema.org/Article">
    <meta itemprop="dateModified" content="2024-10-02T17:14:26+03:00">
    <h1 itemprop="headline">Test Article</h1>
    <hr>
    <div itemprop="articleBody">
        <p>First paragraph with <strong>bold</strong> text.</p>
        <h2>Section heading</h2>
        <ul><li>Item one</li><li>Item two</li></ul>
        <a href="https://example.com">Link</a>
    </div>
</article>
</body>
</html>`;

describe('extractArticleBody', () => {
  it('extracts the articleBody div content', () => {
    const body = extractArticleBody(sampleHtml);
    expect(body).toContain('<p>First paragraph');
    expect(body).toContain('<strong>bold</strong>');
    expect(body).toContain('<h2>Section heading</h2>');
    expect(body).not.toContain('itemprop="headline"');
  });

  it('returns empty string for HTML without articleBody', () => {
    const body = extractArticleBody('<html><body><p>No article</p></body></html>');
    expect(body).toBe('');
  });
});

describe('extractDateModified', () => {
  it('extracts the dateModified ISO string', () => {
    const date = extractDateModified(sampleHtml);
    expect(date).toBe('2024-10-02T17:14:26+03:00');
  });

  it('returns null when not present', () => {
    const date = extractDateModified('<html><body></body></html>');
    expect(date).toBeNull();
  });
});
