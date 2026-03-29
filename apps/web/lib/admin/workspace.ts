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

export interface GlobalAdminOverview {
  metrics: GlobalAdminOverviewMetrics;
  activity: AdminActivityItem[];
}

const emptyOverview: GlobalAdminOverview = {
  metrics: {
    users: {
      total: 0,
      byRole: {
        admin: 0,
        editor: 0,
        viewer: 0,
      },
    },
    knowledgeBases: {
      total: 0,
    },
    apiKeys: {
      active: 0,
      revoked: 0,
    },
  },
  activity: [],
};

export async function fetchGlobalAdminOverview(): Promise<GlobalAdminOverview> {
  try {
    return await apiFetch<GlobalAdminOverview>('/api/admin/overview');
  } catch {
    return emptyOverview;
  }
}

export function buildGlobalAdminMetrics(overview: GlobalAdminOverview): AdminMetricItem[] {
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

export function buildGlobalAdminSummary(overview: GlobalAdminOverview): string {
  const { users, knowledgeBases, apiKeys } = overview.metrics;
  return `The workspace currently covers ${users.total} users, ${knowledgeBases.total} knowledge bases, and ${apiKeys.active} active API keys. Role mix: ${users.byRole.admin} admins, ${users.byRole.editor} editors, and ${users.byRole.viewer} viewers.`;
}
