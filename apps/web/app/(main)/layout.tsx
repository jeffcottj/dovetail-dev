import { Suspense } from 'react';
import Link from 'next/link';
import { FilePlus } from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { SidebarWrapper } from '../../components/SidebarWrapper';
import { SearchBar } from '../../components/SearchBar';
import { RoleGate } from '../../components/RoleGate';
import { Button } from '../../components/ui/Button';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarWrapper>
        <Sidebar />
      </SidebarWrapper>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-border-light px-8 py-4 flex items-center justify-end gap-3">
            <Suspense>
              <SearchBar />
            </Suspense>
            <RoleGate minimumRole="editor">
              <Link href="/articles/new">
                <Button size="sm">
                  <FilePlus className="w-4 h-4" />
                  New Article
                </Button>
              </Link>
            </RoleGate>
        </header>
        <main className="flex-1 p-8 max-w-4xl">{children}</main>
      </div>
    </div>
  );
}
