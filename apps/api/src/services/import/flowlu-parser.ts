export interface FlowluArticle {
  id: string;
  title: string;
  code: string;
  slug: string;
  index: string;
  tags: string[];
  parentChain: string[]; // ancestor IDs, e.g. ['11', '14'] for code '11-14-15--slug'
}

export interface CategoryNode {
  sourceId: string;
  name: string;
  slug: string;
  children: CategoryNode[];
  articleCount: number; // direct articles only (not recursive)
}

interface RawDataJson {
  articles: Record<string, { title: string; code: string; index: string; tags: string[] }>;
}

/**
 * Parse the data.json content from a Flowlu KB export.
 * Returns a flat list of articles with hierarchy info derived from the code field.
 */
export function parseDataJson(jsonContent: string): FlowluArticle[] {
  const data: RawDataJson = JSON.parse(jsonContent);
  const articles: FlowluArticle[] = [];

  for (const [id, raw] of Object.entries(data.articles)) {
    const [prefix, ...slugParts] = raw.code.split('--');
    const slug = slugParts.join('--'); // rejoin in case slug contains --
    const numericParts = prefix.split('-');
    // Last part is the article's own ID, preceding parts are ancestor IDs
    const parentChain = numericParts.slice(0, -1);

    articles.push({
      id,
      title: raw.title,
      code: raw.code,
      slug,
      index: raw.index,
      tags: raw.tags,
      parentChain,
    });
  }

  return articles;
}

/**
 * Build a category tree from parsed articles.
 *
 * Every article becomes a node in the tree. Top-level articles (empty parentChain)
 * are roots. Articles with a parentChain are placed under their immediate parent.
 * articleCount counts the node itself (1 per node).
 */
export function buildCategoryTree(articles: FlowluArticle[]): CategoryNode[] {
  // Create a node for every article
  const nodes = new Map<string, CategoryNode>();
  for (const art of articles) {
    nodes.set(art.id, {
      sourceId: art.id,
      name: art.title,
      slug: art.slug,
      children: [],
      articleCount: 0,
    });
  }

  // Build parent-child links
  const topLevel: CategoryNode[] = [];
  for (const art of articles) {
    const node = nodes.get(art.id)!;
    if (art.parentChain.length === 0) {
      topLevel.push(node);
    } else {
      const immediateParent = art.parentChain[art.parentChain.length - 1];
      const parentNode = nodes.get(immediateParent);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Orphan — treat as top-level
        topLevel.push(node);
      }
    }
  }

  // Calculate articleCount: count the node itself + direct leaf children
  // A "leaf" child is one with no children of its own
  for (const node of nodes.values()) {
    // Count itself
    node.articleCount = 1;
    // Count direct children that are leaves (not subcategories)
    for (const child of node.children) {
      if (child.children.length === 0) {
        node.articleCount += 1;
      }
    }
  }

  return topLevel;
}
