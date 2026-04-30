import type { AdminActivityItem } from '@dovetail/types';

function readRole(metadata: Record<string, unknown>): string {
  const role = metadata.role;
  return typeof role === 'string' ? role : 'unknown';
}

function formatSubjectLabel(item: AdminActivityItem): string {
  return item.subject.label || item.knowledgeBase?.name || 'item';
}

function formatDefaultAccess(value: unknown): string {
  if (value === 'private') return 'Private';
  if (value === 'org_viewer') return 'Org-visible';
  return 'unknown';
}

export function formatAdminActivityLine(item: AdminActivityItem): string {
  const subjectLabel = formatSubjectLabel(item);

  switch (item.kind) {
    case 'user.role_changed':
      return `${item.actor.name} changed ${subjectLabel}'s role to ${readRole(item.metadata)}`;
    case 'user.created':
      return `${item.actor.name} created user ${subjectLabel}`;
    case 'user.deleted':
      return `${item.actor.name} deleted user ${subjectLabel}`;
    case 'kb.created':
      return `${item.actor.name} created knowledge base ${subjectLabel}`;
    case 'kb.access_changed':
      return `${item.actor.name} changed ${subjectLabel} access to ${formatDefaultAccess(item.metadata.to)}`;
    case 'kb.deleted':
      return `${item.actor.name} deleted knowledge base ${subjectLabel}`;
    case 'import.started':
      return `${item.actor.name} started an import for ${subjectLabel}`;
    case 'api_key.created':
      return `${item.actor.name} created API key ${subjectLabel}`;
    case 'api_key.revoked':
      return `${item.actor.name} revoked API key ${subjectLabel}`;
    case 'article.created':
      return `${item.actor.name} created article ${subjectLabel}`;
    case 'article.edited':
      return `${item.actor.name} edited article ${subjectLabel}`;
    default:
      return `${item.actor.name} updated ${subjectLabel}`;
  }
}
