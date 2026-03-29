import { describe, expect, it } from 'vitest';
import { buildAdminActivityInsert, normalizeAdminActivityRow } from '../../services/admin-activity.js';

describe('admin activity helpers', () => {
  it('builds an insert payload with KB context when present', () => {
    const payload = buildAdminActivityInsert({
      kind: 'api_key.revoked',
      actorId: 'user-1',
      knowledgeBaseId: 'kb-1',
      subjectId: 'key-1',
      subjectLabel: 'LibreChat Prod',
      metadata: { revokedAt: '2026-03-28T12:00:00.000Z' },
    });

    expect(payload.kind).toBe('api_key.revoked');
    expect(payload.actorId).toBe('user-1');
    expect(payload.knowledgeBaseId).toBe('kb-1');
  });

  it('normalizes a joined row into the shared response shape', () => {
    const item = normalizeAdminActivityRow({
      id: 'evt-1',
      kind: 'article.edited',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
      actorId: 'user-1',
      actorName: 'Maya Chen',
      actorEmail: 'maya@example.com',
      knowledgeBaseId: 'kb-1',
      knowledgeBaseName: 'Housing',
      subjectId: 'article-1',
      subjectLabel: 'Tenant Eviction Timeline',
      metadata: { articleId: 'article-1' },
    });

    expect(item.actor.name).toBe('Maya Chen');
    expect(item.knowledgeBase?.name).toBe('Housing');
    expect(item.subject.label).toBe('Tenant Eviction Timeline');
  });
});
