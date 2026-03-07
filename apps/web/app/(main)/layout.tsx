import { Suspense } from 'react';
import { Sidebar } from '../../components/Sidebar';
import { SearchBar } from '../../components/SearchBar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b border-border-light px-8 py-4 flex items-center">
          <Suspense>
            <SearchBar />
          </Suspense>
        </header>
        <main className="flex-1 p-8 max-w-4xl">{children}</main>
      </div>
    </div>
  );
}
