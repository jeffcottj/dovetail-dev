import { Suspense } from 'react';
import Link from 'next/link';
import { FilePlus } from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { SidebarWrapper } from '../../components/SidebarWrapper';
import { SearchBar } from '../../components/SearchBar';
import { RoleGate } from '../../components/RoleGate';
import { HeaderUserArea } from '../../components/HeaderUserArea';
import { Button } from '../../components/ui/Button';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <SidebarWrapper>
        <Sidebar />
      </SidebarWrapper>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-border-light px-6 py-3 flex items-center justify-between">
          <div className="flex flex-1 items-center gap-3">
            <RoleGate minimumRole="editor">
              <Link href="/articles/new">
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
        <main id="main-content" className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
