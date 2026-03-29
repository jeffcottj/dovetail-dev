import React from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { FilePlus } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getKbBySlug } from '../../../../lib/kb';
import { KbProvider } from '../../../../components/KbProvider';
import { KbSidebar } from '../../../../components/KbSidebar';
import { SidebarWrapper } from '../../../../components/SidebarWrapper';
import { HeaderUserArea } from '../../../../components/HeaderUserArea';
import { RoleGate } from '../../../../components/RoleGate';
import { SearchBar } from '../../../../components/SearchBar';
import { Button } from '../../../../components/ui/Button';

export default async function KbLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kbSlug: string }>;
}) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);

  if (!kb) notFound();

  return (
    <KbProvider kb={kb}>
      <SidebarWrapper toggleClassName="top-15 -right-4 -translate-y-1/2">
        <KbSidebar kbId={kb.id} kbSlug={kb.slug} />
      </SidebarWrapper>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border-light px-6 py-3 flex items-center justify-between">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <RoleGate minimumRole="editor">
              <Link href={`/kb/${kb.slug}/articles/new`}>
                <Button size="sm" className="whitespace-nowrap">
                  <FilePlus className="w-5 h-5" />
                  New Article
                </Button>
              </Link>
            </RoleGate>
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
          <HeaderUserArea />
        </header>
        <main id="main-content" className="flex-1 min-w-0 p-8">
          {children}
        </main>
      </div>
    </KbProvider>
  );
}
