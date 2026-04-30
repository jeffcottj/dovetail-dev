import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseDataJson, buildCategoryTree, type CategoryNode } from '../../services/import/flowlu-parser.js';
import { extractArticleBody, extractDateModified } from '../../services/import/html-extractor.js';
import { htmlToTiptap } from '../../services/import/html-to-tiptap.js';
import { toSlug } from '../../utils/slug.js';

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

  it('has no slug+parent collisions in the category tree (dedup would work)', () => {
    const json = fs.readFileSync(path.join(SAMPLE_DIR, 'assets', 'data.json'), 'utf-8');
    const articles = parseDataJson(json);
    const tree = buildCategoryTree(articles);

    // Collect all (slug, parentPath) tuples — simulates what createCategories would see
    function collectSlugs(nodes: CategoryNode[], parentPath = ''): string[] {
      const keys: string[] = [];
      for (const node of nodes) {
        const slug = toSlug(node.name);
        const key = `${slug}|${parentPath}`;
        keys.push(key);
        keys.push(...collectSlugs(node.children, `${parentPath}/${slug}`));
      }
      return keys;
    }

    const allKeys = collectSlugs(tree);
    const uniqueKeys = new Set(allKeys);

    // Every (slug, parent) combo must be unique for dedup to work
    expect(allKeys.length).toBe(uniqueKeys.size);
    // Only branch nodes + top-level leaves become categories (fewer than total articles)
    expect(allKeys.length).toBeLessThan(articles.length);
    expect(allKeys.length).toBeGreaterThan(0);
  });

  it('same-name categories exist under different parents (not duplicates)', () => {
    const json = fs.readFileSync(path.join(SAMPLE_DIR, 'assets', 'data.json'), 'utf-8');
    const articles = parseDataJson(json);
    const tree = buildCategoryTree(articles);

    // Find all occurrences of a repeated category name in the tree with their parent paths
    function findByName(nodes: CategoryNode[], name: string, parentPath = ''): string[] {
      const paths: string[] = [];
      for (const node of nodes) {
        if (node.name === name) paths.push(parentPath || '(root)');
        paths.push(...findByName(node.children, name, `${parentPath}/${node.name}`));
      }
      return paths;
    }

    const paths = findByName(tree, 'Landlord/Tenant');
    // "Landlord/Tenant" appears multiple times but always under different parents
    expect(paths.length).toBeGreaterThan(1);
    expect(new Set(paths).size).toBe(paths.length); // all unique parent paths
  });
});
