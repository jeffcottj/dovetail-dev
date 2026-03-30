import type { ReactNode } from 'react';
import type { AdminNavSection } from '../../lib/admin/nav';
import { AdminMetricStrip, type AdminMetricItem } from './AdminMetricStrip';
import { AdminNav } from './AdminNav';
import { AdminSectionHeader, type AdminSectionHeaderProps } from './AdminSectionHeader';

export interface AdminWorkspaceLayoutProps {
  nav: {
    sections: AdminNavSection[];
    isGlobalAdmin: boolean;
    currentKbSlug: string | null;
    currentKbName?: string;
  };
  header: AdminSectionHeaderProps;
  metrics: AdminMetricItem[];
  children: ReactNode;
}

export function AdminWorkspaceLayout({
  nav,
  header,
  metrics,
  children,
}: AdminWorkspaceLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--color-admin-bg)] text-ink lg:flex-row">
      <AdminNav
        sections={nav.sections}
        isGlobalAdmin={nav.isGlobalAdmin}
        currentKbSlug={nav.currentKbSlug}
        currentKbName={nav.currentKbName}
      />
      <main id="main-content" className="min-w-0 flex-1">
        <AdminSectionHeader {...header} />
        <div className="space-y-8 px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
          <AdminMetricStrip items={metrics} />
          {children}
        </div>
      </main>
    </div>
  );
}
