import { describe, expect, it } from 'vitest';
import {
  createFlowluArticleHrefRewriter,
  flowluSourceIdFromArticleCode,
  flowluSourceIdFromHref,
} from '../../services/import/flowlu-links.js';

describe('Flowlu link rewriting', () => {
  it('extracts the source ID from a Flowlu article code', () => {
    expect(flowluSourceIdFromArticleCode('37-45-155--emergency-custody')).toBe('155');
    expect(flowluSourceIdFromArticleCode('119-20--old-service-of-process')).toBe('20');
    expect(flowluSourceIdFromArticleCode('0272-how-keep-your-personal-information-secure')).toBeNull();
  });

  it('recognizes relative article export links', () => {
    expect(flowluSourceIdFromHref('../../articles/37-45-155--emergency-custody/#note')).toEqual({
      sourceId: '155',
      hash: '#note',
    });
  });

  it('recognizes absolute Flowlu article module links', () => {
    expect(flowluSourceIdFromHref(
      'https://accesstojustice.flowlu.com/_module/knowledgebase/view/article/119-20--service-of-process?ignored=true#section',
    )).toEqual({
      sourceId: '20',
      hash: '#section',
    });
  });

  it('does not treat unrelated public article URLs as Flowlu article links', () => {
    expect(flowluSourceIdFromHref('https://www.consumer.ftc.gov/articles/0272-how-keep-your-personal-information-secure')).toBeNull();
    expect(flowluSourceIdFromHref('https://accesstojustice.flowlu.com/_module/system/view/docs_view/file-id')).toBeNull();
  });

  it('rewrites only resolvable article links and preserves fragments', () => {
    const rewriteHref = createFlowluArticleHrefRewriter(new Map([
      ['155', '/kb/default/articles/family-law/custody/emergency-custody'],
    ]));

    expect(rewriteHref('../../articles/37-45-155--emergency-custody/?old=true#top'))
      .toBe('/kb/default/articles/family-law/custody/emergency-custody#top');
    expect(rewriteHref('../../articles/37-45-999--missing/'))
      .toBe('../../articles/37-45-999--missing/');
    expect(rewriteHref('mailto:help@example.com')).toBe('mailto:help@example.com');
  });
});
