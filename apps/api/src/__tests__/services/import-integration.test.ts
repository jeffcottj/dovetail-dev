import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseDataJson, buildCategoryTree } from '../../services/import/flowlu-parser.js';
import { extractArticleBody, extractDateModified } from '../../services/import/html-extractor.js';
import { htmlToTiptap } from '../../services/import/html-to-tiptap.js';

const SAMPLE_DIR = path.resolve(__dirname, '../../../../../sample-import');

describe('Import integration (sample data)', () => {
  it('parses data.json from sample export', () => {
    const json = fs.readFileSync(path.join(SAMPLE_DIR, 'assets', 'data.json'), 'utf-8');
    const articles = parseDataJson(json);
    expect(articles.length).toBeGreaterThan(300);
    expect(articles[0]).toHaveProperty('title');
    expect(articles[0]).toHaveProperty('slug');
    expect(articles[0]).toHaveProperty('parentChain');
  });

  it('builds a category tree with expected structure', () => {
    const json = fs.readFileSync(path.join(SAMPLE_DIR, 'assets', 'data.json'), 'utf-8');
    const articles = parseDataJson(json);
    const tree = buildCategoryTree(articles);
    expect(tree.length).toBeGreaterThan(10);
    // Consumer Debt Collection should be in the tree
    const cdc = tree.find(n => n.name === 'Consumer Debt Collection');
    expect(cdc).toBeDefined();
    expect(cdc!.children.length).toBeGreaterThan(0);
  });

  it('extracts article body from a sample HTML file', () => {
    const html = fs.readFileSync(path.join(SAMPLE_DIR, 'articles', '1020--mdec-resources', 'index.html'), 'utf-8');
    const body = extractArticleBody(html);
    expect(body.length).toBeGreaterThan(100);
  });

  it('extracts dateModified from a sample HTML file', () => {
    const html = fs.readFileSync(path.join(SAMPLE_DIR, 'articles', '1020--mdec-resources', 'index.html'), 'utf-8');
    const date = extractDateModified(html);
    expect(date).toBeTruthy();
    expect(new Date(date!).getFullYear()).toBeGreaterThanOrEqual(2023);
  });

  it('converts a sample article body to valid TipTap JSON', () => {
    const html = fs.readFileSync(path.join(SAMPLE_DIR, 'articles', '1020--mdec-resources', 'index.html'), 'utf-8');
    const body = extractArticleBody(html);
    const tiptap = htmlToTiptap(body);
    expect(tiptap.type).toBe('doc');
    expect(tiptap.content.length).toBeGreaterThan(0);
    // Should contain paragraphs
    const paragraphs = tiptap.content.filter((n: any) => n.type === 'paragraph');
    expect(paragraphs.length).toBeGreaterThan(0);
  });
});
