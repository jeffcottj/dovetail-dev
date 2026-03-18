/**
 * Extract the inner HTML of <div itemprop="articleBody"> from a Flowlu KB HTML page.
 * Uses regex rather than a full DOM parser to keep dependencies minimal.
 */
export function extractArticleBody(html: string): string {
  // Match the opening tag and capture everything until the closing </div> that
  // is followed by whitespace and </article> (or end of content).
  // We use a greedy match for the inner content since we want the outermost closing div.
  const openTag = '<div itemprop="articleBody">';
  const startIdx = html.indexOf(openTag);
  if (startIdx === -1) return '';

  const contentStart = startIdx + openTag.length;

  // Find the matching </div> by tracking nesting
  let depth = 1;
  let i = contentStart;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);

    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4; // skip past "<div"
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, nextClose).trim();
      }
      i = nextClose + 6; // skip past "</div>"
    }
  }

  return '';
}

/**
 * Extract the dateModified value from the Schema.org meta tag.
 */
export function extractDateModified(html: string): string | null {
  const match = html.match(/<meta\s+itemprop="dateModified"\s+content="([^"]+)"/);
  return match ? match[1] : null;
}
