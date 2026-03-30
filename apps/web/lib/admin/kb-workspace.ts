import type { AdminActivityItem, KnowledgeBase } from '@dovetail/types';
import type { AdminMetricItem } from '../../components/admin/AdminMetricStrip';
import { apiFetch } from '../api';

export interface KbAdminOverviewMetrics {
  users: {
    total: number;
  };
  tags: {
    total: number;
  };
  imports: {
    total: number;
  };
  articleActivity: {
    recent: number;
  };
}

export interface KbAdminOverviewData {
  kb: KnowledgeBase;
  metrics: KbAdminOverviewMetrics;
  activity: AdminActivityItem[];
}

export interface KbAdminOverviewSuccess extends KbAdminOverviewData {
  ok: true;
}

export interface KbAdminOverviewFailure {
  ok: false;
  error: string;
}

export type KbAdminOverview = KbAdminOverviewSuccess | KbAdminOverviewFailure;

export async function fetchKbAdminOverview(kbId: string): Promise<KbAdminOverview> {
  try {
    const overview = await apiFetch<KbAdminOverviewData>(`/api/knowledge-bases/${kbId}/admin/overview`);
    return { ok: true, ...overview };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load knowledge base admin overview',
    };
  }
}

export function buildKbAdminMetrics(overview: KbAdminOverviewSuccess): AdminMetricItem[] {
  const { users, tags, imports, articleActivity } = overview.metrics;

  return [
    {
      label: 'KB Users',
      value: users.total,
      detail: 'KB-specific role overrides currently configured',
    },
    {
      label: 'Tags',
      value: tags.total,
      detail: 'Tags available to organize this knowledge base',
    },
    {
      label: 'Imports',
      value: imports.total,
      detail: 'Import jobs recorded for this knowledge base',
    },
    {
      label: 'Recent Article Activity',
      value: articleActivity.recent,
      detail: 'Article create/edit events captured in the last 30 days',
    },
  ];
}

export function buildKbAdminSummary(overview: KbAdminOverviewSuccess): string {
  const { kb, metrics } = overview;
  return `${kb.name} currently has ${metrics.users.total} KB role overrides, ${metrics.tags.total} tags, and ${metrics.imports.total} import jobs. ${metrics.articleActivity.recent} article changes were recorded in the last 30 days.`;
}

export function getKbAdminOverviewWarning(overview: KbAdminOverview): string | null {
  if (overview.ok) return null;
  return `Knowledge base admin overview is temporarily unavailable. ${overview.error}`;
}
