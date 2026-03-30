import Link from 'next/link';
import { Badge } from '../ui/Badge';

export interface AdminSectionHeaderProps {
  title: string;
  scopeLabel?: string;
  primaryActions?: { label: string; href: string }[];
}

export function AdminSectionHeader({
  title,
  scopeLabel,
  primaryActions = [],
}: AdminSectionHeaderProps) {
  return (
    <header className="border-b border-border-light bg-[color:var(--color-admin-panel)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          {scopeLabel ? <Badge variant="info">{scopeLabel}</Badge> : null}
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-ink">
            {title}
          </h1>
        </div>

        {primaryActions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {primaryActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex items-center justify-center rounded-md border border-border bg-[color:var(--color-admin-bg)] px-4 py-2 font-[family-name:var(--font-ui)] text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent"
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
