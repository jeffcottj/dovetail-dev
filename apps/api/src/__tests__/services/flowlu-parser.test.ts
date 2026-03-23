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
    // Only HOA Collections (14) remains; Defending Claims (12) is a leaf, pruned
    expect(cdc.children).toHaveLength(1);
    expect(cdc.children[0].sourceId).toBe('14');

    const hoa = cdc.children[0];
    // HOA MD Contract Lien Act (15) is a leaf, pruned from HOA's children
    expect(hoa.children).toHaveLength(0);
  });

  it('counts articles per category node', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const tree = buildCategoryTree(articles);
    const cdc = tree.find(n => n.sourceId === '11')!;
    // CDC is root: 1 (self) + 2 direct children (12 and 14) = 3
    expect(cdc.articleCount).toBe(3);

    const hoa = cdc.children.find(n => n.sourceId === '14')!;
    // HOA is non-root: 0 (self goes to parent) + 1 direct child (15) = 1
    expect(hoa.articleCount).toBe(1);

    const familyLaw = tree.find(n => n.sourceId === '37')!;
    // Family Law is a top-level leaf: articleCount = 1
    expect(familyLaw.articleCount).toBe(1);
  });

  it('does not include leaf nodes as categories in the tree', () => {
    const articles = parseDataJson(JSON.stringify(sampleData));
    const tree = buildCategoryTree(articles);

    // Collect all sourceIds in the tree
    function collectIds(nodes: ReturnType<typeof buildCategoryTree>): string[] {
      const ids: string[] = [];
      for (const node of nodes) {
        ids.push(node.sourceId);
        ids.push(...collectIds(node.children));
      }
      return ids;
    }

    const treeIds = collectIds(tree);
    // Leaf articles (12 and 15) should NOT appear in the tree
    expect(treeIds).not.toContain('12');
    expect(treeIds).not.toContain('15');
    // Branch and top-level nodes should appear
    expect(treeIds).toContain('11');
    expect(treeIds).toContain('14');
    expect(treeIds).toContain('37');
  });
});
