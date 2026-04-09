import { Suspense } from 'react';
import Link from 'next/link';
import { auth } from '../../auth';
import { apiFetch } from '../../lib/api';
import { hasMinimumRole } from '../../lib/roles';
import { HeaderUserArea } from '../../components/HeaderUserArea';
import { SearchBar } from '../../components/SearchBar';
import { SidebarWrapper } from '../../components/SidebarWrapper';
import { WorkspaceActivityFeed } from '../../components/WorkspaceActivityFeed';
import { WorkspaceSidebar } from '../../components/WorkspaceSidebar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { AdminActivityItem, Role } from '@dovetail/types';

export default async function HomePage() {
  const session = await auth();
  const userRole = (session?.user?.role as Role) ?? 'viewer';
  const isAdmin = hasMinimumRole(userRole, 'admin');

  let activityItems: AdminActivityItem[] = [];
  let unavailableMessage: string | null = null;

  try {
    activityItems = await apiFetch<AdminActivityItem[]>('/api/workspace/activity');
  } catch {
    unavailableMessage = 'Recent activity is unavailable right now.';
  }

  return (
    <>
      <SidebarWrapper toggleClassName="top-15 -right-4 -translate-y-1/2">
        <WorkspaceSidebar />
      </SidebarWrapper>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border-light px-6 py-3 flex items-center justify-between">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
          <HeaderUserArea />
        </header>
        <main id="main-content" className="flex-1 min-w-0 p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_20rem]">
            <WorkspaceActivityFeed items={activityItems} unavailableMessage={unavailableMessage} />

            <aside aria-labelledby="workspace-helper-title">
              <Card>
                <h2
                  id="workspace-helper-title"
                  className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink"
                >
                  Choose a knowledge base
                </h2>
                <p className="mt-2 text-sm text-ink-muted font-[family-name:var(--font-ui)]">
                  Use the sidebar switcher to open a knowledge base and continue browsing articles.
                </p>
                {isAdmin && (
                  <div className="mt-4">
                    <Link href="/admin/knowledge-bases">
                      <Button variant="secondary" size="sm">Manage Knowledge Bases</Button>
                    </Link>
                  </div>
                )}
              </Card>
            </aside>
          </div>
        </main>
      </div>
    </>
  );
}
