import type { ReactNode } from 'react';
import { Card } from '../ui/Card';

export interface AdminMetricItem {
  label: string;
  value: string | number | ReactNode;
  detail?: string;
}

interface AdminMetricStripProps {
  items: AdminMetricItem[];
}

export function AdminMetricStrip({ items }: AdminMetricStripProps) {
  return (
    <section aria-label="Admin metrics">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label} className="!bg-[color:var(--color-admin-panel)]">
            <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
              {item.label}
            </p>
            <div className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-ink">
              {item.value}
            </div>
            {item.detail ? (
              <p className="mt-2 text-sm text-ink-light">{item.detail}</p>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}
