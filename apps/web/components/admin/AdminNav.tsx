import Link from 'next/link';
import type { AdminNavSection } from '../../lib/admin/nav';

interface AdminNavProps {
  sections: AdminNavSection[];
}

export function AdminNav({ sections }: AdminNavProps) {
  return (
    <aside className="w-full shrink-0 border-b border-[color:rgba(255,255,255,0.12)] bg-[color:var(--color-admin-rail)] text-white lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex flex-col overflow-y-auto lg:sticky lg:top-0 lg:h-screen">
        <div className="border-b border-[color:rgba(255,255,255,0.12)] px-4 py-5 sm:px-6 lg:px-6 lg:py-6">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[color:var(--color-sidebar-text)]">
            Maryland Legal Aid
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-white">
            Admin
          </h1>
        </div>

        <nav className="flex-1 px-3 py-4 sm:px-4 sm:py-5 lg:px-4" aria-label="Admin navigation">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
            {sections.map((section) => (
              <section key={section.label}>
                <h2 className="px-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--color-sidebar-text)]">
                  {section.label}
                </h2>
                <div className="mt-3 grid gap-1">
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
        </nav>
      </div>
    </aside>
  );
}
