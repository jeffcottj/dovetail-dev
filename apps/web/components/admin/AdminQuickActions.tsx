import Link from 'next/link';
import { Card } from '../ui/Card';

export interface AdminQuickActionItem {
  label: string;
  href: string;
  description?: string;
}

interface AdminQuickActionsProps {
  items: AdminQuickActionItem[];
}

export function AdminQuickActions({ items }: AdminQuickActionsProps) {
  return (
    <section aria-labelledby="admin-quick-actions">
      <Card className="!bg-[color:var(--color-admin-panel)]">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="admin-quick-actions"
            className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink"
          >
            Quick Actions
          </h2>
        </div>

        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg border border-border-light bg-[color:var(--color-admin-bg)] px-4 py-3 transition-colors hover:border-accent"
            >
              <div className="font-[family-name:var(--font-ui)] text-sm font-semibold text-ink">
                {item.label}
              </div>
              {item.description ? (
                <p className="mt-1 text-sm text-ink-light">{item.description}</p>
              ) : null}
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}
