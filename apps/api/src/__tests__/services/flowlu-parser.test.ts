import { describe, expect, it } from 'vitest';
import { parseDataJson, buildCategoryTree } from '../../services/import/flowlu-parser.js';

const sampleData = {
  articles: {
    '11': { title: 'Consumer Debt Collection', code: '11--consumer-debt-collection', index: 'overview...', tags: [] },
    '12': { title: 'Defending Claims', code: '11-12--defending-claims', index: 'basic defenses...', tags: ['Tag A'] },
    '15': { title: 'HOA MD Contract Lien Act', code: '11-14-15--hoa-md-contract-lien-act', index: 'resources...', tags: [] },
    '14': { title: 'HOA Collections', code: '11-14--hoa-collections', index: 'hoa overview...', tags: [] },
    '37': { title: 'Family Law', code: '37--family-law', index: 'family...', tags: [] },
  },
};

describe('parseDataJson', () => {
  it('parses articles from data.json content', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    expect(articles).toHaveLength(5);
    expect(articles[0]).toMatchObject({
      id: '11',
      title: 'Consumer Debt Collection',
      code: '11--consumer-debt-collection',
      slug: 'consumer-debt-collection',
    });
  });

  it('extracts the slug from the code field (everything after --)', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const art12 = articles.find(a => a.id === '12');
    expect(art12!.slug).toBe('defending-claims');
  });

  it('derives parentChain from the numeric prefix', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const art15 = articles.find(a => a.id === '15');
    expect(art15!.parentChain).toEqual(['11', '14']);
  });

  it('top-level articles have empty parentChain', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const art11 = articles.find(a => a.id === '11');
    expect(art11!.parentChain).toEqual([]);
  });
});

describe('buildCategoryTree', () => {
  it('builds a tree from parsed articles', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const tree = buildCategoryTree(articles);

    // Two top-level categories: Consumer Debt Collection (11) and Family Law (37)
    expect(tree).toHaveLength(2);

    const cdc = tree.find(n => n.sourceId === '11')!;
    expect(cdc.name).toBe('Consumer Debt Collection');
    expect(cdc.children).toHaveLength(2); // 12 (Defending Claims) and 14 (HOA Collections)

    const hoa = cdc.children.find(n => n.sourceId === '14')!;
    expect(hoa.children).toHaveLength(1); // 15
    expect(hoa.children[0].sourceId).toBe('15');
  });

  it('counts articles per category node', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const tree = buildCategoryTree(articles);
    const cdc = tree.find(n => n.sourceId === '11')!;
    // Articles directly in CDC: 11 itself, plus 12
    expect(cdc.articleCount).toBe(2); // 11 and 12 are directly in this category
  });
});
