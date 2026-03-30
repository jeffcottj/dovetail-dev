import Link from 'next/link';
import type { AdminNavSection } from '../../lib/admin/nav';
import { AdminContextSwitcher } from './AdminContextSwitcher';

interface AdminNavProps {
  sections: AdminNavSection[];
  isGlobalAdmin: boolean;
  currentKbSlug: string | null;
  currentKbName?: string;
}

function AdminNavSections({ sections }: { sections: AdminNavSection[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
      {sections.map((section) => (
        <section key={section.label}>
          <div className="grid gap-1">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={`block rounded-md px-3 py-2 font-[family-name:var(--font-ui)] text-sm transition-colors ${
                  item.active
                    ? 'bg-[color:var(--color-admin-rail-muted)] font-semibold text-white shadow-sm'
                    : 'text-white/90 hover:bg-[color:var(--color-admin-rail-muted)] hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AdminNav({ sections, isGlobalAdmin, currentKbSlug, currentKbName }: AdminNavProps) {
  return (
    <>
      <details className="border-b border-[color:rgba(255,255,255,0.12)] bg-[color:var(--color-admin-rail)] text-white lg:hidden">
        <summary className="flex list-none items-center justify-between gap-4 px-4 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
          <div>
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[color:var(--color-sidebar-text)]">
              Dovetail
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-white">
              Admin
            </h1>
            <p className="mt-2 font-[family-name:var(--font-ui)] text-sm text-white/80">
              Browse admin sections
            </p>
          </div>
          <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            Menu
          </span>
        </summary>
        <div className="border-b border-[color:rgba(255,255,255,0.12)] px-3 py-3 sm:px-4">
          <Link
            href="/"
            className="flex w-full items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 font-[family-name:var(--font-ui)] text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            &larr; Return to Knowledge Base
          </Link>
        </div>
        <div className="border-b border-[color:rgba(255,255,255,0.12)] px-3 py-3 sm:px-4">
          <AdminContextSwitcher
            isGlobalAdmin={isGlobalAdmin}
            currentKbSlug={currentKbSlug}
            currentKbName={currentKbName}
          />
        </div>
        <nav className="px-3 pb-4 sm:px-4 sm:pb-5" aria-label="Admin navigation">
          <AdminNavSections sections={sections} />
        </nav>
      </details>

      <aside className="hidden w-full shrink-0 border-b border-[color:rgba(255,255,255,0.12)] bg-[color:var(--color-admin-rail)] text-white lg:block lg:w-96 lg:border-b-0 lg:border-r">
        <div className="flex flex-col overflow-y-auto lg:sticky lg:top-0 lg:h-screen">
          <div className="border-b border-[color:rgba(255,255,255,0.12)] px-4 py-5 sm:px-6 lg:px-6 lg:py-6">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[color:var(--color-sidebar-text)]">
              Dovetail
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-white">
              Admin
            </h1>
          </div>
          <div className="border-b border-[color:rgba(255,255,255,0.12)] px-4 py-3 lg:px-4">
            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 py-2 font-[family-name:var(--font-ui)] text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              &larr; Return to Knowledge Base
            </Link>
          </div>
          <div className="border-b border-[color:rgba(255,255,255,0.12)] px-4 py-3 lg:px-4">
            <AdminContextSwitcher
              isGlobalAdmin={isGlobalAdmin}
              currentKbSlug={currentKbSlug}
              currentKbName={currentKbName}
            />
          </div>

          <nav className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:px-4" aria-label="Admin navigation">
            <AdminNavSections sections={sections} />
          </nav>
        </div>
      </aside>
    </>
  );
}
