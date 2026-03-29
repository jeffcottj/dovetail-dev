import type { AdminActivityItem } from '@dovetail/types';
import type { AdminMetricItem } from '../../components/admin/AdminMetricStrip';
import { apiFetch } from '../api';

export interface GlobalAdminOverviewMetrics {
  users: {
    total: number;
    byRole: {
      admin: number;
      editor: number;
      viewer: number;
    };
  };
  knowledgeBases: {
    total: number;
  };
  apiKeys: {
    active: number;
    revoked: number;
  };
}

export interface GlobalAdminOverviewData {
  metrics: GlobalAdminOverviewMetrics;
  activity: AdminActivityItem[];
}

export interface GlobalAdminOverviewSuccess extends GlobalAdminOverviewData {
  ok: true;
}

export interface GlobalAdminOverviewFailure {
  ok: false;
  error: string;
}

export type GlobalAdminOverview = GlobalAdminOverviewSuccess | GlobalAdminOverviewFailure;

export async function fetchGlobalAdminOverview(): Promise<GlobalAdminOverview> {
  try {
    const overview = await apiFetch<GlobalAdminOverviewData>('/api/admin/overview');
    return { ok: true, ...overview };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to load admin overview',
    };
  }
}

export function buildGlobalAdminMetrics(overview: GlobalAdminOverviewSuccess): AdminMetricItem[] {
  const { users, knowledgeBases, apiKeys } = overview.metrics;

  return [
    {
      label: 'Users',
      value: users.total,
      detail: `${users.byRole.admin} admin / ${users.byRole.editor} editor / ${users.byRole.viewer} viewer`,
    },
    {
      label: 'Knowledge Bases',
      value: knowledgeBases.total,
      detail: 'Global knowledge bases available to administrators',
    },
    {
      label: 'Active API Keys',
      value: apiKeys.active,
      detail: 'Keys currently available for integrations',
    },
    {
      label: 'Revoked API Keys',
      value: apiKeys.revoked,
      detail: 'Keys that have been retired or disabled',
    },
  ];
}

export function buildGlobalAdminSummary(overview: GlobalAdminOverviewSuccess): string {
  const { users, knowledgeBases, apiKeys } = overview.metrics;
  return `The workspace currently covers ${users.total} users, ${knowledgeBases.total} knowledge bases, and ${apiKeys.active} active API keys. Role mix: ${users.byRole.admin} admins, ${users.byRole.editor} editors, and ${users.byRole.viewer} viewers.`;
}

export function getGlobalAdminOverviewWarning(overview: GlobalAdminOverview): string | null {
  if (overview.ok) return null;
  return `Admin overview is temporarily unavailable. ${overview.error}`;
}
