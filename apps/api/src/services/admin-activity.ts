import type { AdminActivityItem, AdminActivityKind } from '@dovetail/types';
import { adminActivityEvents } from '@dovetail/db';
import type { InferInsertModel } from 'drizzle-orm';

export interface BuildAdminActivityInput {
  kind: AdminActivityKind;
  actorId: string;
  knowledgeBaseId?: string | null;
  subjectId: string;
  subjectLabel: string;
  metadata?: Record<string, unknown>;
}

export interface AdminActivityRow {
  id: string;
  kind: string;
  createdAt: Date;
  actorId: string;
  actorName: string;
  actorEmail: string;
  knowledgeBaseId: string | null;
  knowledgeBaseName: string | null;
  subjectId: string;
  subjectLabel: string;
  metadata: Record<string, unknown> | null;
}

export function buildAdminActivityInsert(input: BuildAdminActivityInput): InferInsertModel<typeof adminActivityEvents> {
  return {
    kind: input.kind,
    actorId: input.actorId,
    knowledgeBaseId: input.knowledgeBaseId ?? null,
    subjectId: input.subjectId,
    subjectLabel: input.subjectLabel,
    metadata: input.metadata ?? {},
  };
}

export function normalizeAdminActivityRow(row: AdminActivityRow): AdminActivityItem {
  return {
    id: row.id,
    kind: row.kind as AdminActivityKind,
    createdAt: row.createdAt.toISOString(),
    actor: {
      id: row.actorId,
      name: row.actorName,
      email: row.actorEmail,
    },
    knowledgeBase:
      row.knowledgeBaseId && row.knowledgeBaseName
        ? { id: row.knowledgeBaseId, name: row.knowledgeBaseName }
        : null,
    subject: { id: row.subjectId, label: row.subjectLabel },
    metadata: row.metadata ?? {},
  };
}
