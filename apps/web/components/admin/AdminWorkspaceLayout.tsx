import type { ReactNode } from 'react';
import type { AdminActivityItem } from '@dovetail/types';
import type { AdminNavSection } from '../../lib/admin/nav';
import { AdminActivityFeed } from './AdminActivityFeed';
import { AdminMetricStrip, type AdminMetricItem } from './AdminMetricStrip';
import { AdminNav } from './AdminNav';
import { AdminQuickActions, type AdminQuickActionItem } from './AdminQuickActions';
import { AdminSectionHeader, type AdminSectionHeaderProps } from './AdminSectionHeader';

export interface AdminWorkspaceLayoutProps {
  nav: {
    sections: AdminNavSection[];
  };
  header: AdminSectionHeaderProps;
  metrics: AdminMetricItem[];
  actions: AdminQuickActionItem[];
  activity: AdminActivityItem[];
  activityUnavailableMessage?: string | null;
  children: ReactNode;
}

export function AdminWorkspaceLayout({
  nav,
  header,
  metrics,
  actions,
  activity,
  activityUnavailableMessage,
  children,
}: AdminWorkspaceLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--color-admin-bg)] text-ink lg:flex-row">
      <AdminNav sections={nav.sections} />
      <main id="main-content" className="min-w-0 flex-1">
        <AdminSectionHeader {...header} />
        <div className="space-y-8 px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
          <AdminMetricStrip items={metrics} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <AdminQuickActions items={actions} />
            <AdminActivityFeed items={activity} unavailableMessage={activityUnavailableMessage} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
